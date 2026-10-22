export const SKILLS = [
  "analyze-pr-test-gaps",
  "write-backend-unit-tests",
  "write-frontend-unit-tests",
  "verify-and-report-tests",
] as const;

export type SkillName = (typeof SKILLS)[number];

const ALLOWED_PATH = /^(backend\/tests\/[^/]+\.test\.ts|frontend\/src\/(?:[^/]+\/)*[^/]+\.test\.tsx?)$/;

export interface Decision {
  decision: "updated-tests" | "no-tests-needed";
  reason: string;
  skills: SkillName[];
  summary: string;
}

export function classifyPaths(paths: string[]): { allowed: string[]; denied: string[] } {
  const allowed: string[] = [];
  const denied: string[] = [];
  for (const file of paths) {
    const normalized = file.replaceAll("\\", "/").trim();
    const safe = normalized.length > 0 && !normalized.startsWith("/") && !normalized.split("/").includes("..");
    if (safe && ALLOWED_PATH.test(normalized)) allowed.push(normalized);
    else if (normalized.length > 0) denied.push(normalized);
  }
  return { allowed, denied };
}

export function pathsFromStatus(porcelain: string): string[] {
  return porcelain
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 3)
    .map((line) => {
      const path = line.slice(3).replaceAll('"', "");
      return path.includes(" -> ") ? path.slice(path.lastIndexOf(" -> ") + 4) : path;
    });
}

export function packagesFor(paths: string[]): Array<"backend" | "frontend"> {
  const packages = new Set<"backend" | "frontend">();
  for (const file of paths) {
    if (file.startsWith("backend/")) packages.add("backend");
    if (file.startsWith("frontend/")) packages.add("frontend");
  }
  return [...packages];
}

export function shouldSkipCommit(message: string): boolean {
  return message.includes("[pr-test-agent]");
}

export function parseDecision(raw: string): Decision {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("decision.json is not valid JSON");
  }
  if (typeof value !== "object" || value === null) throw new Error("decision.json must be an object");
  const record = value as Record<string, unknown>;
  if (record.decision !== "updated-tests" && record.decision !== "no-tests-needed") {
    throw new Error("decision.json has an unknown decision");
  }
  if (typeof record.reason !== "string" || record.reason.trim() === "" || record.reason.length > 1000) {
    throw new Error("decision.json reason must be a short string");
  }
  if (typeof record.summary !== "string" || record.summary.trim() === "" || record.summary.length > 2000) {
    throw new Error("decision.json summary must be a short string");
  }
  if (!Array.isArray(record.skills) || record.skills.length === 0) throw new Error("decision.json must list skills");
  const skills: SkillName[] = [];
  for (const skill of record.skills) {
    if (typeof skill !== "string" || !SKILLS.includes(skill as SkillName)) throw new Error(`unknown skill: ${String(skill)}`);
    skills.push(skill as SkillName);
  }
  if (!skills.includes("analyze-pr-test-gaps")) throw new Error("analyze-pr-test-gaps must be listed");
  if (record.decision === "updated-tests") {
    if (!skills.includes("verify-and-report-tests")) throw new Error("updated tests must be verified");
    if (!skills.some((skill) => skill.startsWith("write-"))) throw new Error("updated tests must name a writing skill");
  }
  return { decision: record.decision, reason: record.reason.trim(), skills, summary: record.summary.trim() };
}

export function neutralText(value: string, max = 1200): string {
  return value.replaceAll("@", "(at)").replaceAll("\u0000", "").trim().slice(0, max);
}

export function tail(value: string, max = 4000): string {
  const clean = value.replaceAll("\u0000", "").trim();
  if (clean.length <= max) return clean;
  return `...[truncated]\n${clean.slice(clean.length - max)}`;
}

export interface TestRun {
  packageName: "backend" | "frontend";
  passed: boolean;
  output: string;
}

export function renderReport(input: {
  decision: Decision;
  tests: TestRun[];
  files: string[];
  runId?: string;
  agentId?: string;
}): string {
  const testSection = input.tests.length === 0
    ? "No unit tests were run."
    : input.tests.map((test) => `### ${test.packageName}\n\n${test.passed ? "Passed" : "Failed"}\n\n\`\`\`text\n${tail(test.output)}\n\`\`\``).join("\n\n");
  const files = input.files.length === 0 ? "None." : input.files.map((file) => `- \`${file}\``).join("\n");
  return [
    "<!-- pr-test-agent -->",
    "## Test agent",
    "",
    `**Decision:** ${input.decision.decision}`,
    "",
    neutralText(input.decision.reason),
    "",
    "### Skills",
    ...input.decision.skills.map((skill) => `- \`${skill}\``),
    "",
    "### Summary",
    "",
    neutralText(input.decision.summary, 2000),
    "",
    "### Verified tests",
    "",
    testSection,
    "",
    "### Files committed",
    "",
    files,
    "",
    input.runId ? `Run \`${input.runId}\` on agent \`${input.agentId ?? "unknown"}\`.` : "",
  ].filter((line) => line !== "").join("\n");
}
