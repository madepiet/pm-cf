# Pull request test agent

The test agent keeps unit tests aligned with pull request changes. It runs in GitHub Actions, decides whether tests are warranted, writes only test files, runs those tests, and publishes the result on the pull request.

## Decisions

The agent runtime is the Cursor SDK local agent (`@cursor/sdk`) inside GitHub Actions. The job already has the repository checkout, so the agent can edit that checkout and the workflow can run `npm test` before anything is pushed. A cloud agent would open a separate pull request and would not be constrained by the tool allowlist below.

The workflow uses `pull_request_target` and checks out two trees. The agent program and skills come from the pull request's base commit. The code under test comes from the pull request head. A pull request therefore cannot replace the agent, its skills, or the workflow that holds `CURSOR_API_KEY`. Forks are skipped. The same-repository check matters because this event can otherwise run with repository secrets.

The model does not get a general shell, network tools, or delete. It can read and edit the workspace, and it can call two host tools: `run_unit_tests` (only `npm test` in `backend` or `frontend`) and `record_decision`. Before the model starts, the runner removes `CURSOR_API_KEY` and `GITHUB_TOKEN` from the process environment. The SDK receives the API key as an option, and the token is restored only after tests pass, for the commit, push, and comment.

After the model finishes, trusted code keeps a change only when it is an existing or new unit test:

- `backend/tests/*.test.ts`
- `frontend/src/**/*.test.ts`
- `frontend/src/**/*.test.tsx`

Anything else is reverted. The workflow then runs the affected package tests itself. One follow-up turn is allowed when those tests fail. A passing result is committed as `github-actions[bot]` with the marker `[pr-test-agent]` and pushed to the head branch. That marker stops the next workflow run from reviewing its own commit. The comment is created or updated in place, so later runs do not stack new comments.

`settingSources` is empty. Skills are read from the trusted checkout and pasted into the prompt. Copies of those files inside the pull request are not authoritative. The diff is wrapped as untrusted data, and the comment strips `@` so a model summary cannot mention a GitHub user.

## How to run it

The workflow is `.github/workflows/pr-test-agent.yml`. It starts on a non-draft pull request opened from this repository. Drafts and forks are skipped. A documentation-only change still runs, and the agent can answer `no-tests-needed`.

Prerequisites:

- Node.js 22.13 or newer on the runner. The workflow selects Node 22.
- A Cursor API key stored as the Actions secret `CURSOR_API_KEY`. Create one at [Cursor Dashboard → Integrations](https://cursor.com/dashboard/integrations). User keys and team service-account keys work. Team Admin API keys do not.
- The default `GITHUB_TOKEN` permissions in the workflow: `contents: write` and `pull-requests: write`.
- Dependencies are installed with `npm ci` from the lockfiles. No extra services are required. Backend tests mock Prisma and do not need PostgreSQL.

Optional: set the Actions variable or change `CURSOR_MODEL` in the workflow. The default model is `composer-2.5`.

To exercise it, open a pull request that changes frontend or backend behavior. The check is named "Update unit tests". Its comment starts with the hidden marker `pr-test-agent`.

The agent's own checks can be run locally:

```sh
cd agents/pr-test-agent
npm ci
npm test
npm run typecheck
```

## Where the agent and skills live

| Piece | Path | Role |
| --- | --- | --- |
| Custom agent | `agents/pr-test-agent/AGENT.md` | Identity, procedure, and boundaries |
| Runner | `agents/pr-test-agent/src/run.ts` | SDK session, tool host, retry, commit, comment |
| Policy | `agents/pr-test-agent/src/policy.ts` | Path allowlist, decision schema, report |
| Analyze skill | `.cursor/skills/analyze-pr-test-gaps/SKILL.md` | Whether the diff needs tests |
| Backend skill | `.cursor/skills/write-backend-unit-tests/SKILL.md` | Vitest and Supertest conventions |
| Frontend skill | `.cursor/skills/write-frontend-unit-tests/SKILL.md` | Vitest and Testing Library conventions |
| Verify skill | `.cursor/skills/verify-and-report-tests/SKILL.md` | Which commands must pass |

The runner loads `AGENT.md` and all four skills from the trusted tree into one prompt. The model must call `record_decision`. The workflow, not the model, posts the comment and pushes.

## Coverage added with the solution

These tests cover modules that previously had no unit tests. Current suite results: backend 57 tests, about 75% statements; frontend 29 tests, about 72% statements. Design-system files stay excluded, matching the existing frontend coverage config.

- Backend: `config.test.ts`, `database.test.ts`, `factory.test.ts`, `lifespan.test.ts`
- Frontend: `http.test.ts`, `AppProviders.test.tsx`, `TodoEmptyState.test.tsx`, `useTodoFilters.test.tsx`, `todoMutations.test.tsx`

`backend/src/main.ts` remains uncovered. It only starts the process.

## Example run

The example pull request adds task counts without tests. The workflow on that pull request is the execution record: the agent's decision, the skills it listed, and the test commands the runner verified. This section is updated after that run with the pull request link and those results.

## Assumptions

- Pull requests that should receive commits are opened from branches in this repository, not from forks.
- `CURSOR_API_KEY` belongs to an account that can use `composer-2.5` and the local SDK.
- Reviewers accept commits from `github-actions[bot]` on the head branch.
- The base commit contains this workflow. `pull_request_target` reads the workflow from the base, so the first run happens only after this file is on the default branch.
- Unit tests remain runnable with `npm test` and without PostgreSQL.

## Limitations

- The model can still be prompt-injected by the diff. The host limits the damage: no shell, secrets removed before the run, and a path allowlist before push. It can still waste the API budget or write a poor test.
- `npm ci` and `npm test` execute the pull request's dependency scripts and tests. They run without the API key or GitHub token, but they still run on the runner.
- The sandbox allows workspace edits. It is not a full virtual machine.
- One repair turn is the retry budget. A second failure discards the test edits and fails the check.
- There is no coverage threshold gate. The agent adds behavioral tests, not a coverage percentage.
- Forks, draft pull requests, and commits marked `[pr-test-agent]` are skipped.
- Without `CURSOR_API_KEY`, the check passes and the comment explains that the agent did not start.

## Production changes

- Run the model in an isolated container with a non-root user, a read-only dependency install, and no outbound network except the Cursor API.
- Require a human approval label before the bot pushes, and protect the default branch.
- Store the API key in a short-lived GitHub environment with required reviewers.
- Cap diff size further, add a token budget, and alert on repeated run failures.
- Extend the allowlist only with review. Do not let the agent edit production code, workflows, or lockfiles.
- Publish the verified command output as a check annotation as well as a comment.
