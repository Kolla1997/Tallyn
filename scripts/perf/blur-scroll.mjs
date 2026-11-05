// #263: estimate the cost of the card blur while scrolling, on a phone-sized Chrome with a 4x slower CPU.
// Run from the repo root with the dev server on 5180 (or change the URL below):
//   node scripts/perf/blur-scroll.mjs
import { Browser, sleep } from '../../.claude/skills/design-taste-frontend/scripts/lib/cdp.mjs'
const PAGES = ['home', 'accounts', 'transactions']
const VARIANTS = {
  'as is': '',
  'cards solid (sidebar, tab bar keep blur)': 'cards',
  'smaller blur (6px)': 'small',
}
const setup = (mode) => {
  const all = [...document.querySelectorAll('*')].filter((e) => getComputedStyle(e).backdropFilter !== 'none')
  window.__blurred = all.length
  for (const e of all) {
    const chrome = e.closest('aside, nav, .tabbar, header')
    if (mode === 'cards' && !chrome) { e.style.setProperty('backdrop-filter', 'none', 'important'); e.style.setProperty('-webkit-backdrop-filter', 'none', 'important') }
    if (mode === 'small') { e.style.setProperty('backdrop-filter', 'blur(6px)', 'important'); e.style.setProperty('-webkit-backdrop-filter', 'blur(6px)', 'important') }
  }
}
const startMeasure = () => { window.__f = []; let last = performance.now(); const tick = (t) => { window.__f.push(t - last); last = t; if (window.__on) requestAnimationFrame(tick) }; window.__on = true; requestAnimationFrame(tick) }
const stopMeasure = () => { window.__on = false; const f = window.__f.slice(2); const dropped = f.filter((d) => d > 25).length; const long = f.filter((d) => d > 50).length; const avg = f.reduce((a, b) => a + b, 0) / f.length; return { frames: f.length, fps: Math.round(1000 / avg), dropped, long, blurred: window.__blurred } }
const browser = await Browser.launch({ width: 412, height: 915 })
const out = []
for (const p of PAGES) for (const [name, mode] of Object.entries(VARIANTS)) {
  const runs = []
  for (let r = 0; r < 3; r++) {
    const page = await browser.newPage({ width: 412, height: 915, dsf: 2.625, mobile: true })
    await page.send('Emulation.setCPUThrottlingRate', { rate: 4 })
    await page.goto(`http://localhost:5180/preview.html?p=${p}`, { settleMs: 4000 })
    await page.eval(`(${setup})(${JSON.stringify(mode)})`)
    await sleep(500)
    await page.eval(`(${startMeasure})()`)
    await page.wheel(4000, { step: 120, pauseMs: 16 })
    await page.wheel(-4000, { step: 120, pauseMs: 16 })
    await sleep(300)
    runs.push(await page.eval(`(${stopMeasure})()`))
    await page.close()
  }
  const med = (k) => runs.map((x) => x[k]).sort((a, b) => a - b)[1]
  out.push({ page: p, variant: name, fps: med('fps'), dropped: med('dropped'), long: med('long'), frames: med('frames'), blurred: runs[0].blurred })
  console.log(JSON.stringify(out.at(-1)))
}
await browser.close()
