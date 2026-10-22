---
name: write-backend-unit-tests
description: Writes Taskly backend unit tests with Vitest and Supertest. Use when a pull request changes backend behavior and those changes need new or updated tests.
---

# Backend unit tests

Tests live in `backend/tests/*.test.ts` and import implementation files from `../src/...`. Use Vitest. Do not start PostgreSQL.

## Patterns already used in this repository

- Pure functions: call them and assert the returned value or the thrown error.
- Routers: build an Express app around `createTodosRouter` or `createApp` and call it with Supertest. Pass a repository or database double.
- Prisma: construct `createDatabase` with a dummy URL and `vi.spyOn` the delegate method. Do not connect.
- Shared todo rows belong in `backend/tests/fixture.ts`. Add a field there only when production types require it.

Match the existing style: semicolons, single quotes, and `it` / `it.each` from Vitest. Cover the new success path and the failure path the change introduces (validation status, not found, or thrown configuration error). Keep each test focused on one behavior.

Do not edit files under `backend/src`. Do not add dependencies.
