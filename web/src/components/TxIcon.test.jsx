import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import TxIcon from './TxIcon.jsx'

// Merchant logos (#42, kept in the calm tile, #187): only from Plaid's logo hosts, else the category icon.
describe('TxIcon', () => {
  it('shows a Plaid logo and ignores any other host', () => {
    const { container, rerender } = render(
      <TxIcon tx={{ logo_url: 'https://plaid-merchant-logos.plaid.com/uber_1060.png', category_primary: 'TRANSPORTATION' }} />,
    )
    expect(container.querySelector('img')).toHaveAttribute('referrerpolicy', 'no-referrer')
    rerender(<TxIcon tx={{ logo_url: 'https://example.com/uber.png', category_primary: 'TRANSPORTATION' }} />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('svg path')).toBeInTheDocument()
  })
})
