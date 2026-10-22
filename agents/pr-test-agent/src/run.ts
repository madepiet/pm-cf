import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Agent, CursorAgentError } from "@cursor/sdk";
import { upsertComment } from "./github.js";
import { parseDecision, renderReport, type Decision, type TestRun } from "./policy.js";
import { takeSecrets } from "./process.js";
import { buildPrompt, loadInstructions } from "./prompt.js";
import { changedPaths, commitTests, diffAgainst, discard, headMessage, partition, readDecision, resetWorkspace, runPackageTests, verify } from "./workspace.js";

const workspace = process.env.PR_WORKSPACE ?? "";
const trustedRoot = process.env.TRUSTED_ROOT ?? "";
const prNumber = Number(process.env.PR_NUMBER ?? "");
const baseSha = process.env.BASE_SHA ?? "";
const headRef = process.env.HEAD_REF ?? "";
const repo = process.env.REPO ?? "";
const model = process.env.CURSOR_MODEL?.trim() || "composer-2.5";
const title = process.env.PR_TITLE ?? "";

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

async function comment(token: string, body: string): Promise<void> {
  if (!repo || !prNumber) return;
  await upsertComment({ repo, pr: prNumber, body, token, cwd: workspace });
}

function tools(root: string) {
  return {
    run_unit_tests: {
      description: "Run npm test in the backend or frontend package. No other commands are available.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["package"],
        properties: { package: { type: "string", enum: ["backend", "frontend"] } },
      },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
      execute: async (args: Record<string, unknown>) => {
        const packageName = args.package === "backend" || args.package === "frontend" ? args.package : null;
        if (!packageName) return { content: [{ type: "text" as const, text: "package must be backend or frontend" }], isError: true };
        const result = await runPackageTests(root, packageName);
        return { content: [{ type: "text" as const, text: result.output.slice(-8000) }], isError: !result.passed };
      },
    },
    record_decision: {
      description: "Record the final test decision. Call this once, after analysis and any test updates.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["decision", "reason", "skills", "summary"],
        properties: {
          decision: { type: "string", enum: ["updated-tests", "no-tests-needed"] },
          reason: { type: "string" },
          skills: { type: "array", items: { type: "string" } },
          summary: { type: "string" },
        },
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      execute: async (args: Record<string, unknown>) => {
        const destination = path.join(root, "agents/pr-test-agent/out");
        await mkdir(destination, { recursive: true });
        const body = JSON.stringify({
          decision: args.decision,
          reason: args.reason,
          skills: args.skills,
          summary: args.summary,
        });
        try {
          parseDecision(body);
        } catch (error) {
          return { content: [{ type: "text" as const, text: error instanceof Error ? error.message : "invalid decision" }], isError: true };
        }
        await writeFile(path.join(destination, "decision.json"), body);
        return { content: [{ type: "text" as const, text: "Decision recorded." }] };
      },
    },
  };
}

async function send(agent: Awaited<ReturnType<typeof Agent.create>>, prompt: string) {
  const run = await agent.send(prompt);
  console.log(`agent ${agent.agentId} run ${run.id}`);
  const result = await run.wait();
  if (result.status === "error") {
    const error = new Error(result.error?.message ?? `run ${result.id} failed`);
    error.name = "RunFailed";
    throw Object.assign(error, { runId: result.id, agentId: agent.agentId, exitCode: 2 });
  }
  return { runId: result.id, agentId: agent.agentId };
}

async function main(): Promise<void> {
  const { apiKey, githubToken } = takeSecrets(process.env);
  if (!workspace || !trustedRoot || !baseSha || !headRef || !repo || !prNumber) fail("Missing pull request context.");
  if (!/^[0-9a-f]{40}$/.test(baseSha) || !/^[A-Za-z0-9._/-]+$/.test(headRef) || headRef.includes("..") || !/^[^/\s]+\/[^/\s]+$/.test(repo)) {
    fail("Pull request context failed validation.");
  }
  if (shouldSkip(await headMessage(workspace))) {
    console.log("Skipping a commit created by the test agent.");
    return;
  }
  if (!apiKey) {
    await comment(githubToken, [
      "<!-- pr-test-agent -->",
      "## Test agent",
      "",
      "The agent did not start because `CURSOR_API_KEY` is not configured for this repository.",
      "Add it under Settings → Secrets and variables → Actions, then push another commit to this pull request.",
    ].join("\n"));
    return;
  }

  const instructions = await loadInstructions(trustedRoot);
  const changes = await diffAgainst(workspace, baseSha);
  const prompt = buildPrompt({ ...instructions, ...changes, title });
  let ids = { runId: "", agentId: "" };
  try {
    await using agent = await Agent.create({
      apiKey,
      model: { id: model },
      name: "pr-test-agent",
      tools: ["read", "edit", "grep", "glob", "ls", "mcp"],
      disallowedTools: ["shell", "delete", "webSearch", "webFetch", "task"],
      local: {
        cwd: workspace,
        settingSources: [],
        sandboxOptions: { enabled: true },
        customTools: tools(workspace),
      },
    });
    ids = await send(agent, prompt);
    let outcome = await settle(ids);
    if (outcome.retry) {
      ids = await send(agent, outcome.retry);
      outcome = await settle(ids);
    }
    if (outcome.failure) {
      await comment(githubToken, outcome.report);
      process.exit(outcome.exitCode);
    }
    if (outcome.commit) await commitTests(workspace, outcome.files, githubToken, headRef, repo);
    await comment(githubToken, outcome.report);
  } catch (error) {
    if (error instanceof CursorAgentError) {
      await comment(githubToken, `<!-- pr-test-agent -->\n## Test agent\n\nThe agent did not start: ${error.message}`);
      process.exit(1);
    }
    if (error instanceof Error && error.name === "RunFailed") {
      await comment(githubToken, `<!-- pr-test-agent -->\n## Test agent\n\nThe agent run failed: ${error.message}`);
      process.exit(2);
    }
    throw error;
  }
}

function shouldSkip(message: string): boolean {
  return message.includes("[pr-test-agent]");
}

async function settle(ids: { runId: string; agentId: string }): Promise<{ report: string; files: string[]; commit: boolean; retry?: string; failure: boolean; exitCode: number }> {
  let decision: Decision;
  try {
    decision = parseDecision(await readDecision(workspace));
  } catch (error) {
    await resetWorkspace(workspace);
    const missing = error instanceof Error && "code" in error && error.code === "ENOENT";
    const reason = missing ? "The agent finished without recording a decision." : error instanceof Error ? error.message : "The agent did not record a decision.";
    return { report: `<!-- pr-test-agent -->\n## Test agent\n\n${reason}\n\nRun \`${ids.runId}\` on agent \`${ids.agentId}\`.`, files: [], commit: false, failure: true, exitCode: 1 };
  }
  const { allowed, denied } = partition(await changedPaths(workspace));
  await discard(workspace, denied);
  if (decision.decision === "no-tests-needed") {
    await resetWorkspace(workspace);
    return { report: renderReport({ decision, tests: [], files: [], ...ids }), files: [], commit: false, failure: false, exitCode: 0 };
  }
  const tests = await verify(workspace, allowed);
  const failed = tests.filter((test) => !test.passed);
  if (failed.length > 0 && !process.env.PR_TEST_AGENT_RETRIED) {
    process.env.PR_TEST_AGENT_RETRIED = "1";
    return {
      report: "",
      files: allowed,
      commit: false,
      failure: false,
      exitCode: 0,
      retry: `The workflow reverted edits outside unit tests and re-ran the tests. They failed. Fix only the test files.\n\n${failed.map(formatFailure).join("\n\n")}\n\nCall record_decision again when the tests pass.`,
    };
  }
  if (failed.length > 0 || allowed.length === 0) {
    const report = renderReport({ decision, tests, files: [], ...ids });
    await resetWorkspace(workspace);
    return { report, files: [], commit: false, failure: true, exitCode: 1 };
  }
  return { report: renderReport({ decision, tests, files: allowed, ...ids }), files: allowed, commit: true, failure: false, exitCode: 0 };
}

function formatFailure(test: TestRun): string {
  return `${test.packageName} failed:\n${test.output.slice(-4000)}`;
}

await main();
