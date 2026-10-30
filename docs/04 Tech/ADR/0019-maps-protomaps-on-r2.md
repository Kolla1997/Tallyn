---
type: adr
status: draft
owner: Dinesh
updated: 2026-10-30
issue: 60
tags: [adr, frontend, infra, privacy]
---

# 0019 — Maps: Protomaps (OpenStreetMap) self-hosted on Cloudflare R2

- **Status:** Proposed
- **Date:** 2026-10-30
- **Ticket:** #60

## Context
Transactions keep where a purchase happened (latitude and longitude, #9), shown only to people allowed to see time and location (#28). Today the details panel offers **Open in Maps**, which leaves Coinroof. #60 adds a map inside the app, and later a dashboard map of spending by place. Where a family shops is sensitive: a map provider that serves the tiles learns which areas each person looks at.

## Options considered
- **A. Protomaps, self-hosted on Cloudflare R2** (chosen by Dinesh, 2026-10-30). One PMTiles file cut from Protomaps' daily OpenStreetMap build, drawn by MapLibre GL JS. Only our own file host sees requests. Free under R2's 10 GB. Refreshed by hand every few months.
- **B. Google Maps.** Always current and easiest, but Google sees each person's map views and IP address; paid beyond a free monthly allowance; strict display terms; needs a line in the Privacy Policy.
- **C. MapTiler or Mapbox.** Hosted OpenStreetMap tiles with one key; the provider still sees map views.

## Decision
Option A, US only (lower 48, Alaska, Hawaii) at **zoom 13**. Measured on the 2026-10-30 build: zoom 13 ≈ 4.6 GB, zoom 14 ≈ 9.6 GB, full detail ≈ 20 GB. Zoom 13 leaves room under R2's free 10 GB; the map library enlarges the last level, which is enough to show the streets around a pin.

- The map loads only after the person taps **Show map**.
- The pin comes from the bank's coordinates, not the map, so an older map still places it correctly.
- The CSP adds only the map host; no map-company scripts, fonts or images.
- Attribution: © OpenStreetMap.
- Hosting: bucket `coinroof-maps`, its public r2.dev address for development, a custom domain once #203 settles the domain.

## Consequences
- The map is a copy: shops and roads opened since the last refresh are missing until we refresh it.
- Adding countries means a bigger file; past 10 GB, R2 charges a small monthly amount per GB.
- Uploading a file this size needs Cloudflare's `wrangler` or rclone, not the web page.
