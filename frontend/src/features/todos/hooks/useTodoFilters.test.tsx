import { act, renderHook } from '@testing-library/react'
import { expect, it } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { useTodoFilters } from './useTodoFilters'

it('filters the visible tasks from the hook state', () => {
  const completed = { ...todoFixture, id: 8, title: 'Done', completed: true }
  const { result } = renderHook(() => useTodoFilters([todoFixture, completed]))
  expect(result.current.visible.map((todo) => todo.id)).toEqual([8, 7])
  act(() => result.current.setFilter('completed'))
  expect(result.current.visible).toEqual([completed])
  act(() => {
    result.current.setFilter('all')
    result.current.setSearch('demo')
  })
  expect(result.current.visible).toEqual([todoFixture])
})
