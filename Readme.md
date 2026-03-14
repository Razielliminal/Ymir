# doesn't matter

> ground truth from the ground, not from above

A decentralized, offline-first crisis coordination app. No servers. No accounts. No infrastructure required.

## What it does

- **Mesh networking** — phones communicate directly via ultrasonic audio (works on iPhone) and WebRTC
- **Community-built map** — people mark food, water, shelter, medical, danger zones in real time
- **Genshin-style minimap** — rotating compass minimap with off-screen node indicators
- **SOS broadcast** — one tap sends distress signal to all nearby devices
- **Voice broadcast** — walkie-talkie style voice to mesh
- **Threat mode** — auto-detects sharp motion, dims UI, pauses broadcasts
- **Full data wipe** — one long press, everything gone

## Why

Every crisis coordination tool is top-down. Someone in an office decides where aid goes, when it's safe, what the map looks like.

This one is bottom-up. The people experiencing the crisis decide everything.

## Tech

- Pure PWA — HTML, CSS, JavaScript. No framework. No build tools.
- Works in any browser including old Android browsers
- Ultrasonic audio mesh via Web Audio API (no permissions on iOS beyond mic)
- WebRTC for Android/Chrome where available
- IndexedDB + localStorage for all data — nothing leaves the device
- No Google Maps — community-named locations on a blank canvas

## Structure

```
doesnt-matter/
├── index.html        — entry point
├── manifest.json     — PWA manifest
├── css/
│   └── main.css      — all styles
├── js/
│   ├── app.js        — main logic, boot, node creation
│   ├── map.js        — Genshin minimap + main map engine
│   ├── mesh.js       — ultrasonic + WebRTC mesh
│   └── ui.js         — UI helpers
└── assets/
    └── icons/        — app icons
```

## Run locally

Just open `index.html` in Chrome. No server needed.

For full mesh testing, serve over HTTPS (required for mic access):
```bash
npx serve .
```

## Philosophy

- No accounts, no servers, no surveillance
- Community names their own locations (confuses outsiders)
- Auto-expiry on all location data (30 min default)
- One-tap full wipe
- App goes dormant when community decides, not when we decide
- Open source always

## Status

Early prototype. Mesh networking is scaffolded, ultrasonic beaconing works, map and node system functional. WebRTC peer connections and full voice relay in progress.

Built with purpose. Not with noise.