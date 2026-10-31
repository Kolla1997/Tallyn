import homeLight from '../assets/launch/home-light.jpg'
import homeDark from '../assets/launch/home-dark.jpg'
import accountsLight from '../assets/launch/accounts-light.jpg'
import accountsDark from '../assets/launch/accounts-dark.jpg'
import budgetsLight from '../assets/launch/budgets-light.jpg'
import budgetsDark from '../assets/launch/budgets-dark.jpg'
import transactionsLight from '../assets/launch/transactions-light.jpg'
import transactionsDark from '../assets/launch/transactions-dark.jpg'

// The stand-in product video on the launch page (#220, Dinesh picked C): four of the app's real
// screens, made with the preview's made-up family (no real account), cross-fade every 4 seconds while
// each drifts slowly closer, with one caption each. A "Demo" label marks it; the real video replaces
// it later. Dark mode shows the dark screens (the light set never loads there: lazy and hidden).
// Reduced motion: the first screen, still. Screen readers get one description.
const SCENES = [
  [homeLight, homeDark, 'Every account, one total'],
  [accountsLight, accountsDark, 'Every account, side by side'],
  [budgetsLight, budgetsDark, 'Budgets that keep pace'],
  [transactionsLight, transactionsDark, 'Every transaction, in one place'],
]

export default function LaunchVideo() {
  return (
    <div className="launch-video launch-demo" role="img" aria-label="A short demo of Coinroof: one total of every account, accounts, budgets and transactions">
      {SCENES.map(([light, dark, caption], i) => (
        <div key={caption} className="launch-scene" style={{ '--i': i }} aria-hidden="true">
          <img className="dark:hidden" src={light} alt="" loading="lazy" decoding="async" />
          <img className="hidden dark:block" src={dark} alt="" loading="lazy" decoding="async" />
          <span className="launch-caption">{caption}</span>
        </div>
      ))}
      <span className="launch-demo-tag" aria-hidden="true">
        Demo
      </span>
    </div>
  )
}
