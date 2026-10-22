import request from 'supertest';
import { expect, it, vi } from 'vitest';
import { createApp } from '../src/factory.ts';

function database(findFirst = vi.fn().mockResolvedValue(null)) {
  return { todo: { findFirst } } as never;
}

it('reports health and serves the OpenAPI document', async () => {
  const findFirst = vi.fn().mockResolvedValue({ id: 1 });
  const app = createApp(database(findFirst));
  expect((await request(app).get('/api/health')).body).toEqual({ status: 'ok' });
  expect(findFirst).toHaveBeenCalledOnce();
  const specification = await request(app).get('/openapi.json');
  expect(specification.status).toBe(200);
  expect(specification.body.info.title).toBe('Taskly App Node API');
});

it('returns not found, invalid JSON, and unexpected errors as JSON', async () => {
  const findFirst = vi.fn().mockRejectedValue(new Error('database unavailable'));
  const app = createApp(database(findFirst));
  expect((await request(app).get('/missing')).status).toBe(404);
  expect((await request(app).post('/api/todos').set('Content-Type', 'application/json').send('{"title":')).status).toBe(422);
  expect((await request(app).get('/api/health')).body).toEqual({ detail: 'Internal Server Error' });
});

it('rejects an oversized JSON body', async () => {
  const app = createApp(database());
  const response = await request(app).post('/api/todos').send({ title: 'x'.repeat(200_000) });
  expect(response.status).toBe(413);
  expect(response.body).toEqual({ detail: 'Request body too large.' });
});
