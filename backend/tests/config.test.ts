import { afterEach, expect, it } from 'vitest';
import { resolveDatabaseUrl } from '../src/core/config.ts';

const keys = ['DATABASE_URL', 'POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_HOST', 'DB_PORT', 'POSTGRES_DB'];
const previous = new Map(keys.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const [key, value] of previous) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

it('rewrites an explicit SQLAlchemy URL', () => {
  expect(resolveDatabaseUrl('postgresql+psycopg://user:secret@db.internal:5432/taskly')).toBe('postgresql://user:secret@db.internal:5432/taskly');
});

it('builds a URL from the required environment variables', () => {
  delete process.env.DATABASE_URL;
  process.env.POSTGRES_USER = 'taskly';
  process.env.POSTGRES_PASSWORD = 'secret';
  process.env.POSTGRES_HOST = 'db.internal';
  process.env.DB_PORT = '5432';
  process.env.POSTGRES_DB = 'taskly app';
  expect(resolveDatabaseUrl()).toBe('postgresql://taskly:secret@db.internal:5432/taskly%20app');
});

it('reports the first missing database variable', () => {
  for (const key of keys) delete process.env[key];
  process.env.POSTGRES_USER = 'taskly';
  expect(() => resolveDatabaseUrl()).toThrow('Missing environment variable: POSTGRES_PASSWORD');
});
