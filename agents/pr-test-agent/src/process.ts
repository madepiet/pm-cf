import { execFile } from "node:child_process";

const SECRET_NAMES = ["CURSOR_API_KEY", "GITHUB_TOKEN", "GH_TOKEN", "GH_ENTERPRISE_TOKEN"];

export function takeSecrets(env: NodeJS.ProcessEnv): { apiKey: string; githubToken: string } {
  const apiKey = env.CURSOR_API_KEY?.trim() ?? "";
  const githubToken = (env.GITHUB_TOKEN ?? env.GH_TOKEN)?.trim() ?? "";
  for (const name of SECRET_NAMES) delete env[name];
  return { apiKey, githubToken };
}

export function redact(text: string, secrets: string[]): string {
  return secrets.filter(Boolean).reduce((output, secret) => output.split(secret).join("[redacted]"), text);
}

export function runCommand(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = process.env, timeout = 240_000): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(command, args, { cwd, env, timeout, maxBuffer: 12 * 1024 * 1024 }, (error, stdout, stderr) => {
      resolve({
        code: error ? (typeof error.code === "number" ? error.code : 1) : 0,
        stdout: String(stdout ?? ""),
        stderr: String(stderr ?? ""),
      });
    });
  });
}
