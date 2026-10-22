import { QueryClient } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { AppProviders } from './AppProviders'

it('renders children with the application providers', () => {
  render(
    <AppProviders client={new QueryClient()}>
      <p>Ready</p>
    </AppProviders>,
  )
  expect(screen.getByText('Ready')).toBeVisible()
})
