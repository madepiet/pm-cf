import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { classifyPaths, packagesFor, type TestRun } from "./policy.js";
import { redact, runCommand } from "./process.js";

export async function git(args: string[], cwd: string, env?: NodeJS.ProcessEnv): Promise<string> {
  const result = await runCommand("git", args, cwd, env, 60_000);
  if (result.code !== 0) throw new Error(`${result.stderr || result.stdout}`.trim() || `git ${args[0]} failed`);
  return result.stdout;
}

export async function changedPaths(cwd: string): Promise<string[]> {
  const [tracked, untracked] = await Promise.all([
    git(["diff", "--name-only", "HEAD"], cwd),
    git(["ls-files", "--others", "--exclude-standard"], cwd),
  ]);
  return [...new Set(`${tracked}\n${untracked}`.split("\n").map((file) => file.trim()).filter(Boolean))];
}

export async function headMessage(cwd: string): Promise<string> {
  return (await git(["log", "-1", "--format=%s%n%b"], cwd)).trim();
}

export async function diffAgainst(cwd: string, baseSha: string): Promise<{ files: string[]; diff: string }> {
  const files = (await git(["diff", "--name-only", `${baseSha}...HEAD`], cwd)).split("\n").map((file) => file.trim()).filter(Boolean);
  const diff = await git(["diff", "--unified=3", `${baseSha}...HEAD`], cwd);
  return { files, diff };
}

export function partition(paths: string[]) {
  return classifyPaths(paths);
}

export async function discard(cwd: string, denied: string[]): Promise<void> {
  if (denied.length === 0) return;
  const tracked = new Set((await git(["ls-files"], cwd)).split("\n").filter(Boolean));
  const existing = denied.filter((file) => tracked.has(file));
  if (existing.length > 0) await git(["checkout", "HEAD", "--", ...existing], cwd);
  await Promise.all(denied.filter((file) => !tracked.has(file)).map((file) => rm(path.join(cwd, file), { recursive: true, force: true })));
}

export async function resetWorkspace(cwd: string): Promise<void> {
  await git(["reset", "--hard", "HEAD"], cwd);
  await git(["clean", "-fd"], cwd);
}

export async function commitTests(cwd: string, files: string[], token: string, headRef: string, repo: string): Promise<void> {
  await git(["add", "--", ...files], cwd);
  const directory = await mkdtemp(path.join(os.tmpdir(), "pr-test-agent-commit-"));
  const message = path.join(directory, "message.txt");
  await writeFile(message, "test: cover pull request changes [pr-test-agent]\n\nAdd or update unit tests for the behavior changed in this pull request.\n");
  await git(["-c", "user.name=github-actions[bot]", "-c", "user.email=41898282+github-actions[bot]@users.noreply.github.com", "commit", "-F", message], cwd);
  const remote = `https://x-access-token:${token}@github.com/${repo}.git`;
  try {
    await git(["push", remote, `HEAD:refs/heads/${headRef}`], cwd);
  } catch (error) {
    throw new Error(redact(error instanceof Error ? error.message : "git push failed", [token]));
  }
}

export async function runPackageTests(cwd: string, packageName: "backend" | "frontend"): Promise<TestRun> {
  const result = await runCommand("npm", ["test"], path.join(cwd, packageName), process.env, 300_000);
  return { packageName, passed: result.code === 0, output: `${result.stdout}\n${result.stderr}` };
}

export async function verify(cwd: string, files: string[]): Promise<TestRun[]> {
  const results: TestRun[] = [];
  for (const packageName of packagesFor(files)) results.push(await runPackageTests(cwd, packageName));
  return results;
}

export async function readDecision(cwd: string): Promise<string> {
  return readFile(path.join(cwd, "agents/pr-test-agent/out/decision.json"), "utf8");
}
