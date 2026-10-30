import { useEffect, useRef, useState } from 'react'
import { Map as MapLibre, Marker, addProtocol, setWorkerUrl } from 'maplibre-gl'
// MapLibre draws in a worker loaded from its own file; the bundler moves that file, so name it.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Protocol } from 'pmtiles'
import { layers, namedFlavor } from '@protomaps/basemaps'
import { MAP_ASSETS as ASSETS, MAP_URL } from '../lib/map.js'

// Where a purchase happened, on Coinroof's own US map (#60, ADR 0019). The map is one file on
// our R2 host (Protomaps' OpenStreetMap build, US at zoom 13); the browser reads only the parts
// it needs, so no map company sees where anyone shops. Loaded only from TxSummary, which shows
// it only when time and location are visible to the viewer (#28).

setWorkerUrl(workerUrl)

let registered = false
function source() {
  if (MAP_URL.endsWith('.pmtiles')) {
    if (!registered) {
      addProtocol('pmtiles', new Protocol().tile)
      registered = true
    }
    return { type: 'vector', url: `pmtiles://${MAP_URL}` }
  }
  return { type: 'vector', tiles: [MAP_URL], maxzoom: 13 }
}

const isDark = () => document.documentElement.classList.contains('dark')

// The calm grey flavours, so the red pin is the only colour on the map.
function style(dark) {
  const all = layers('protomaps', namedFlavor(dark ? 'black' : 'grayscale'), { lang: 'en' })
  return {
    version: 8,
    ...(ASSETS && { glyphs: `${ASSETS}/fonts/{fontstack}/{range}.pbf` }),
    sources: { protomaps: source() },
    layers: ASSETS ? all : all.filter((l) => l.type !== 'symbol'),
  }
}

export default function TxMap({ lat, lon, name }) {
  const box = useRef(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const el = box.current
    if (!el) return
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const map = new MapLibre({
      container: el,
      style: style(isDark()),
      center: [lon, lat],
      zoom: 15,
      attributionControl: false,
      // Two fingers or Ctrl to move it, so scrolling the panel still scrolls the panel.
      cooperativeGestures: true,
      fadeDuration: still ? 0 : 300,
    })
    const pin = document.createElement('div')
    pin.className = 'tx-map-pin'
    map.once('idle', () => {
      setReady(true)
      new Marker({ element: pin }).setLngLat([lon, lat]).addTo(map)
    })
    // Follow the light and dark switch.
    const theme = new MutationObserver(() => map.setStyle(style(isDark())))
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => {
      theme.disconnect()
      map.remove()
    }
  }, [lat, lon])

  return (
    <div className={`tx-map${ready ? ' is-ready' : ''}`} role="img" aria-label={`Map of where ${name} is`}>
      <div ref={box} className="tx-map-gl" />
      <span className="tx-map-credit">© OpenStreetMap</span>
    </div>
  )
}
