---
name: write-frontend-unit-tests
description: Writes Taskly frontend unit tests with Vitest and Testing Library. Use when a pull request changes frontend behavior and those changes need new or updated tests.
---

# Frontend unit tests

Place `*.test.ts` or `*.test.tsx` next to the module under test. The runner is Vitest with jsdom and Testing Library. `src/test/setup.ts` cleans up rendered components.

## Patterns already used in this repository

- Components that import the design system mock it with `vi.mock('<relative>/design-system', () => import('<relative>/design-system/mocks'))`.
- Query hooks need a fresh `QueryClient` inside `QueryClientProvider`. Mock `todosApi` instead of calling the network.
- Reuse `src/test/todoFixture.ts` for a `Todo`.
- Assert visible roles and text with Testing Library. Prefer `userEvent` for clicks.

Match Prettier: single quotes, no semicolons, trailing commas where the existing frontend tests use them. Test the behavior introduced by the diff, including the empty, error, or disabled state when the change has one. Update an existing test when its component contract changed. Do not snapshot the whole DOM.

Do not edit production components, hooks, or API modules. Do not add dependencies. Leave `src/design-system/**` untested.
