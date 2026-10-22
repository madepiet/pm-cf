import { afterEach, expect, it, vi } from 'vitest'
import { request } from './http'

afterEach(() => vi.unstubAllGlobals())

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
  })
}

it('sends JSON requests and returns the parsed body', async () => {
  const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ status: 'ok' }))
  vi.stubGlobal('fetch', fetchMock)
  await expect(request('/health')).resolves.toEqual({ status: 'ok' })
  expect(fetchMock).toHaveBeenCalledWith(
    '/api/health',
    expect.objectContaining({
      headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
    }),
  )
})

it('returns undefined for an empty success response', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
  )
  await expect(
    request('/todos/1', { method: 'DELETE' }),
  ).resolves.toBeUndefined()
})

it('uses the server detail and a fixed message for invalid tasks', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse({ detail: 'Task not found.' }, 404))
    .mockResolvedValueOnce(jsonResponse({ detail: ['invalid'] }, 422))
  vi.stubGlobal('fetch', fetchMock)
  await expect(request('/todos/9')).rejects.toThrow('Task not found.')
  await expect(request('/todos', { method: 'POST' })).rejects.toThrow(
    'Check the task details',
  )
})

it('reports a connection failure and rethrows an aborted request', async () => {
  const abort = new DOMException('The operation was aborted.', 'AbortError')
  const controller = new AbortController()
  controller.abort()
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockRejectedValueOnce(new TypeError('network'))
      .mockRejectedValueOnce(abort),
  )
  await expect(request('/todos')).rejects.toThrow(
    'Cannot connect to the server',
  )
  await expect(request('/todos', { signal: controller.signal })).rejects.toBe(
    abort,
  )
})
