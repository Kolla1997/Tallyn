// Checks the three libraries load together (#183). Made-up data.
import { useRef } from 'react'
import { animate } from 'animejs'
import { LineChart } from '@/components/charts/line-chart'
import { Line } from '@/components/charts/line'
import { Grid } from '@/components/charts/grid'
import { XAxis } from '@/components/charts/x-axis'
import ReceiptPrinter from '@/components/kokonutui/receipt-printer'
import SpendingRing from '@/components/kokonutui/spending-ring'

const spend = [1495, 62, 48, 90, 35, 170, 40, 55, 70, 30, 85, 240, 60, 160, 45, 72, 88, 64, 180, 52, 78, 96, 84, 87]
let running = 0
const data = spend.map((d, i) => ({ date: new Date(2026, 9, i + 1), spent: (running += d) }))

export default function Smoke() {
  const button = useRef(null)
  const press = () => animate(button.current, { scale: [1, 0.96, 1], duration: 220, ease: 'outQuad' })
  return (
    <main className="mx-auto grid max-w-5xl gap-8 p-8">
      <h1 className="text-2xl font-semibold">Draft lab</h1>
      <section className="rounded-lg border p-6">
        <h2 className="mb-4 font-semibold">Bklit line chart</h2>
        <LineChart data={data}>
          <Grid horizontal />
          <Line dataKey="spent" stroke="var(--chart-1)" />
          <XAxis />
        </LineChart>
      </section>
      <section className="grid gap-8 md:grid-cols-2">
        <ReceiptPrinter merchant="The Rivera family" order="Oct" date="24 Oct 2026" autoPrint={false} />
        <SpendingRing title="October spending" />
      </section>
      <button ref={button} onClick={press} className="justify-self-start rounded-full bg-primary px-5 py-2 text-primary-foreground">
        anime.js press
      </button>
    </main>
  )
}
