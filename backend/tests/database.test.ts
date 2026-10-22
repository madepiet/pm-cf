import { expect, it, vi } from 'vitest';
import { createDatabase, initialize } from '../src/core/database.ts';

it('creates the todos table when the database is initialized', async () => {
  const database = createDatabase('postgresql://test:test@127.0.0.1:5432/test');
  const execute = vi.spyOn(database, '$executeRaw').mockResolvedValue(0);
  await initialize(database);
  expect(execute).toHaveBeenCalledOnce();
  expect(String(execute.mock.calls[0]?.[0])).toContain('CREATE TABLE IF NOT EXISTS todos');
});
