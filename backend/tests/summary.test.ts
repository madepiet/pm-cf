import express from 'express';
import request from 'supertest';
import { expect, it, vi } from 'vitest';
import { createTodosRouter } from '../src/features/todos/router.ts';
import { summarizeTasks } from '../src/features/todos/summary.ts';
import { todo } from './fixture.ts';

it('counts open and completed tasks', () => {
  expect(summarizeTasks([])).toEqual({ total: 0, open: 0, completed: 0 });
  expect(summarizeTasks([{ completed: false }, { completed: true }, { completed: true }])).toEqual({ total: 3, open: 1, completed: 2 });
});

it('returns the task summary without treating summary as an id', async () => {
  const repository = {
    list: vi.fn().mockResolvedValue([todo, { ...todo, id: 2, completed: true }]),
    create: vi.fn(), get: vi.fn(), update: vi.fn(), delete: vi.fn(),
  };
  const app = express();
  app.use(express.json());
  app.use('/api/todos', createTodosRouter(repository));
  const response = await request(app).get('/api/todos/summary');
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ total: 2, open: 1, completed: 1 });
  expect(repository.list).toHaveBeenCalledOnce();
});
