import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { redact, runCommand } from "./process.js";

interface Comment {
  id: number;
  body?: string;
}

async function gh(args: string[], cwd: string, token: string): Promise<string> {
  const env = { ...process.env };
  if (token) {
    env.GH_TOKEN = token;
    env.GITHUB_TOKEN = token;
  }
  const result = await runCommand("gh", args, cwd, env, 60_000);
  if (result.code !== 0) throw new Error(redact(`${result.stderr}\n${result.stdout}`, [token]));
  return result.stdout;
}

export async function upsertComment(options: { repo: string; pr: number; body: string; token: string; cwd: string }): Promise<void> {
  const listed = await gh(["api", `repos/${options.repo}/issues/${options.pr}/comments?per_page=100`], options.cwd, options.token);
  const comments = JSON.parse(listed) as Comment[];
  const existing = comments.find((comment) => comment.body?.includes("<!-- pr-test-agent -->"));
  const directory = await mkdtemp(path.join(os.tmpdir(), "pr-test-agent-"));
  const payload = path.join(directory, "comment.json");
  await writeFile(payload, JSON.stringify({ body: options.body }));
  const route = existing
    ? `repos/${options.repo}/issues/comments/${existing.id}`
    : `repos/${options.repo}/issues/${options.pr}/comments`;
  const method = existing ? "PATCH" : "POST";
  await gh(["api", "--method", method, route, "--input", payload], options.cwd, options.token);
}
