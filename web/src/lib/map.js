// The map host (#60, ADR 0019), kept apart from TxMap so knowing whether there is a map
// doesn't load the map library. VITE_MAP_URL: the .pmtiles file on our R2 host, or a
// {z}/{x}/{y} tile address in development. VITE_MAP_ASSETS: the folder with the map's
// label fonts; without it the map has no labels.
export const MAP_URL = import.meta.env.VITE_MAP_URL ?? ''
export const MAP_ASSETS = (import.meta.env.VITE_MAP_ASSETS ?? '').replace(/\/$/, '')
