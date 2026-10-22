import { afterEach, expect, it, vi } from 'vitest';

const database = {
  $connect: vi.fn().mockResolvedValue(undefined),
  $disconnect: vi.fn().mockResolvedValue(undefined),
};
const server = {
  address: () => ({ port: 8000 }),
  close: (callback: () => void) => callback(),
  once: vi.fn(),
};
const listen = vi.fn((_port: number, _host: string, callback: () => void) => {
  queueMicrotask(callback);
  return server;
});

vi.mock('../src/core/database.ts', () => ({
  createDatabase: vi.fn(() => database),
  initialize: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../src/factory.ts', () => ({ createApp: vi.fn(() => ({ listen })) }));
vi.mock('../src/core/config.ts', () => ({ resolveDatabaseUrl: vi.fn(() => 'postgresql://test') }));

import { initialize } from '../src/core/database.ts';
import { start } from '../src/core/lifespan.ts';

afterEach(() => {
  process.removeAllListeners('SIGTERM');
  process.removeAllListeners('SIGINT');
});

it('connects, creates the schema, and listens', async () => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  process.env.API_PORT = '8000';
  const started = await start();
  expect(initialize).toHaveBeenCalledWith(database);
  expect(listen).toHaveBeenCalledWith(8000, '0.0.0.0', expect.any(Function));
  expect(started.server).toBe(server);
  expect(started.database).toBe(database);
});

it('disconnects when startup fails', async () => {
  vi.mocked(initialize).mockRejectedValueOnce(new Error('schema'));
  await expect(start()).rejects.toThrow('schema');
  expect(database.$disconnect).toHaveBeenCalled();
});
