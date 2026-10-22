---
name: verify-and-report-tests
description: Runs Taskly unit tests and records whether the pull request test update passed. Use after creating or updating frontend or backend unit tests.
---

# Verify tests

Run only the package you changed, from that package directory:

```sh
npm test
```

`backend` uses Vitest in Node. `frontend` uses Vitest in jsdom. Both must finish with exit code 0 before you finish. If a test fails because the assertion does not match the new behavior, fix the test. If it fails because production code is wrong, stop and say so in `decision.json`. Do not change production code and do not skip the failing test.

The workflow runs both suites again after you finish and publishes the command output on the pull request. Your `decision.json` `summary` must state which commands you ran and that they passed. Do not commit, push, or post a GitHub comment.
