import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TxDetails, TxSummary } from './TxSummary.jsx'

// The map (#60): a stand-in for the map library, and a map host the tests switch on and off.
const map = vi.hoisted(() => ({ url: 'https://pub-fake.r2.dev/us.pmtiles' }))
vi.mock('../lib/map.js', () => ({
  get MAP_URL() {
    return map.url
  },
  MAP_ASSETS: '',
}))
vi.mock('./TxMap.jsx', () => ({ default: ({ lat, lon, name }) => <div role="img" aria-label={`Map of where ${name} is`} data-at={`${lat},${lon}`} /> }))

// The Transactions summary (#58): the category legend lists every category
// with its share. (A legend hidden by CSS, as in #94, needs a browser test.)
const totals = {
  currency: 'USD',
  money_in_minor: 350000,
  spent_minor: 1000,
  transfers_minor: 2500,
  categories: [
    { category: 'FOOD_AND_DRINK', amount_minor: 600, count: 3 },
    { category: 'TRANSPORTATION', amount_minor: 400, count: 2 },
  ],
  merchants: [{ merchant: 'Uber', amount_minor: 400, count: 2 }],
}

describe('TxSummary', () => {
  it('shows totals, the category legend and top merchants', () => {
    render(<TxSummary totals={totals} scope="All time · yours" month="" day="" />)
    expect(screen.getByText('All time · yours')).toBeInTheDocument()
    expect(screen.getByText("Transfers and loan payments ($25.00) aren't counted as spending.")).toBeInTheDocument()
    const legend = screen.getByRole('list', { name: /categories/i })
    expect(within(legend).getByText('Food and drink')).toBeInTheDocument()
    expect(within(legend).getByText('60%')).toBeInTheDocument()
    expect(within(legend).getByText('Transportation')).toBeInTheDocument()
    expect(within(legend).getByText('40%')).toBeInTheDocument()
    expect(screen.getByText('Uber')).toBeInTheDocument()
  })

  describe('transaction details: the map (#60)', () => {
    const tx = {
      id: 't1',
      amount_minor: 6418,
      currency: 'USD',
      merchant: "Trader Joe's",
      name: "TRADER JOE'S #551",
      date: '2026-10-28',
      category_primary: 'FOOD_AND_DRINK',
      owner_id: 'u-me',
      whereabouts: { address: '211 Walter Seaholm Dr', city: 'Austin', region: 'TX', postal_code: '78701', lat: 30.2669, lon: -97.7428 },
    }
    const open = (t = tx) => render(<TxDetails tx={t} meId="u-me" people={[]} onBack={() => {}} onMerchant={() => {}} />)

    it('map beside the address, with Open in Maps still there', async () => {
      map.url = 'https://pub-fake.r2.dev/us.pmtiles'
      open()
      const m = await screen.findByRole('img', { name: /Map of where/ })
      expect(m).toHaveAttribute('data-at', '30.2669,-97.7428')
      expect(screen.getByText('211 Walter Seaholm Dr')).toBeInTheDocument()
      expect(screen.getByText("Coinroof's own map, private")).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Open in Maps' })).toBeInTheDocument()
    })

    it('no map without coordinates', () => {
      map.url = 'https://pub-fake.r2.dev/us.pmtiles'
      open({ ...tx, whereabouts: { ...tx.whereabouts, lat: null, lon: null } })
      expect(screen.queryByRole('img', { name: /Map of where/ })).toBeNull()
      expect(screen.getByText('211 Walter Seaholm Dr')).toBeInTheDocument()
    })

    it('no map without a map host', () => {
      map.url = ''
      open()
      expect(screen.queryByRole('img', { name: /Map of where/ })).toBeNull()
      expect(screen.queryByText("Coinroof's own map, private")).toBeNull()
    })

    it('no place shared: no map, no address', () => {
      map.url = 'https://pub-fake.r2.dev/us.pmtiles'
      open({ ...tx, whereabouts: null })
      expect(screen.queryByRole('img', { name: /Map of where/ })).toBeNull()
      expect(screen.getByText('No location for this one.')).toBeInTheDocument()
    })
  })
})
