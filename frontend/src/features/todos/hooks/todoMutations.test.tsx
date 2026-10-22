import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import type { Todo, TodoInput } from '../types'
import { useCreateTodoMutation } from './useCreateTodoMutation'
import { useDeleteTodoMutation } from './useDeleteTodoMutation'
import { useTodosBusy } from './useTodosBusy'
import { useTodosQuery } from './useTodosQuery'
import { useUpdateTodoMutation } from './useUpdateTodoMutation'

vi.mock('../api/todos', () => ({
  todosApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}))

const input: TodoInput = {
  title: 'Prepare a demo',
  description: '',
  priority: 'medium',
  due_date: null,
  completed: false,
}

function renderWithClient<T>(
  hook: () => T,
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  }),
) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, ...renderHook(hook, { wrapper }) }
}

it('loads tasks into the list query', async () => {
  vi.mocked(todosApi.list).mockResolvedValue([todoFixture])
  const { result } = renderWithClient(() => useTodosQuery())
  await waitFor(() => expect(result.current.data).toEqual([todoFixture]))
})

it('prepends a created task without keeping a stale copy', async () => {
  const saved = { ...todoFixture, id: 9, title: 'Saved' }
  vi.mocked(todosApi.create).mockResolvedValue(saved)
  const { client, result } = renderWithClient(() => useCreateTodoMutation())
  client.setQueryData<Todo[]>(todoKeys.list, [
    todoFixture,
    { ...todoFixture, id: 9 },
  ])
  await act(async () => {
    await result.current.mutateAsync(input)
  })
  expect(client.getQueryData(todoKeys.list)).toEqual([saved, todoFixture])
})

it('replaces an updated task and removes a deleted task', async () => {
  const saved = { ...todoFixture, completed: true }
  vi.mocked(todosApi.update).mockResolvedValue(saved)
  vi.mocked(todosApi.remove).mockResolvedValue(undefined)
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  client.setQueryData<Todo[]>(todoKeys.list, [
    todoFixture,
    { ...todoFixture, id: 8 },
  ])
  const update = renderWithClient(() => useUpdateTodoMutation(), client)
  await act(async () => {
    await update.result.current.mutateAsync({
      id: todoFixture.id,
      input: { completed: true },
    })
  })
  expect(client.getQueryData<Todo[]>(todoKeys.list)?.[0]).toEqual(saved)
  const remove = renderWithClient(() => useDeleteTodoMutation(), client)
  await act(async () => {
    await remove.result.current.mutateAsync(8)
  })
  expect(
    client.getQueryData<Todo[]>(todoKeys.list)?.map((todo) => todo.id),
  ).toEqual([todoFixture.id])
})

it('reports busy while a task mutation is in flight', async () => {
  let resolveCreate: (todo: Todo) => void = () => undefined
  vi.mocked(todosApi.create).mockImplementation(
    () =>
      new Promise((resolve) => {
        resolveCreate = resolve
      }),
  )
  const { result } = renderWithClient(() => ({
    busy: useTodosBusy(),
    create: useCreateTodoMutation(),
  }))
  act(() => {
    void result.current.create.mutate(input)
  })
  await waitFor(() => expect(result.current.busy).toBe(true))
  await act(async () => {
    resolveCreate(todoFixture)
  })
  await waitFor(() => expect(result.current.busy).toBe(false))
})
