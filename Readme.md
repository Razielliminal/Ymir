# ymir ᛉ
> *ground truth from the ground, not from above.*

ymir is an offline-first crisis coordination tool for civilians in active conflict zones. it works without internet, without accounts, and without revealing who you are to anyone.

it looks like a weather app. that is intentional.

---

## what it does

phones near each other connect directly — no server, no internet, no company in the middle. information spreads person to person through a mesh of devices in the same area, like a chain.

people drop pins on a shared blank map. food. water. medical help. shelter. danger. the map has no street names, no landmarks, no real geography. blank on purpose. an outsider who finds a phone sees nothing useful. only people with local knowledge understand what the pins mean.

the more people confirm a pin is real, the brighter it glows. one person = faint. five people = trusted by the community. no central authority. just people deciding together what's real.

when you need to find something, the minimap becomes a compass. walk toward the arrow.

when you need to disappear, hold the logo for three seconds. everything is gone.

---

## features

- **offline mesh networking** — WebRTC peer to peer, no internet required
- **blank map with pins** — 10 types: food, water, medical, shelter, power, rescue, checkpoint, danger, family, custom
- **pin trust system** — community confirmation makes pins brighter
- **genshin-style minimap navigation** — rotating compass, pulsing arrow, distance counter, auto-arrival
- **status broadcast** — safe / injured / need help, silent, instant
- **SOS** — one tap distress signal to all nearby devices
- **family finder board** — post a name, syncs to everyone nearby, expires in 2 hours
- **area notes** — freeform local intelligence, syncs over mesh
- **pin search** — find pins by name, type, or description
- **category filter** — show only the type of pin you need
- **QR transfer** — share your entire map offline via QR code
- **pin comments** — leave notes on any pin
- **pin expiry + nudge system** — you decide how long, app asks if it's still there
- **flag system** — report a pin as gone, owner decides what to do
- **music sync** — propose a track, majority vote plays it simultaneously
- **threat mode** — pauses all broadcasts, dims the UI
- **full data wipe** — hold the logo 3 seconds, everything gone permanently
- **app camouflage** — looks like a weather app, triple tap the temperature to unlock
- **guided tooltip tour** — walks new users through every button on first launch
- **quiet moments** — small honest confirmations when what you did helped someone
- **PWA** — installs on any phone, works fully offline after first load

---

## what was deliberately left out

**no voice relay.** voice identifies you. one recording in the wrong hands and you're found. everything else in ymir is anonymous. voice breaks that.

**no real map data.** street names tell an outsider what area is being coordinated. the blank grid forces local knowledge to be the map.

**no peer counts.** "8 devices nearby" is also "8 people are clustered here." the mesh shows only active or scanning. never a number.

**no accounts. no servers. no cloud.** nothing to seize. nothing to subpoena. nothing to hack.

**no feedback inside the app.** a feedback form requires a server connection, which creates a record. feedback goes through GitHub issues only.

---

## the most important rule

never write the real name of a street, building, or neighborhood. use only names that people who live there already know.

✓ "the blue door"  
✓ "abu's place"  
✓ "the school everyone knows"  

✗ real street names  
✗ real building names  
✗ anything a stranger could search  

if a phone is ever captured, those names mean nothing to an outsider. that is the protection.

---

## built for

- Russia–Ukraine
- Sudan civil war
- Israel–Palestine / wider regional conflict
- Myanmar
- Syria
- Somalia
- Haiti
- Eastern DR Congo
- Afghanistan–Pakistan border
- Yemen

and anywhere else people need to coordinate without being found.

---

## tech stack

| layer | technology |
|---|---|
| shell | PWA, service worker, offline-first |
| map | HTML5 Canvas, custom render engine |
| mesh | WebRTC data channels, BroadcastChannel API |
| signaling | FastAPI WebSocket (bootstrap only, not required offline) |
| ultrasonic | Web Audio API, 18.5kHz presence beacon |
| storage | localStorage only, no external database |
| transfer | QR code (qrcodejs + jsQR) |
| GPS | Geolocation API, haversine distance calculation |
| compass | DeviceOrientation API |
| deployment | Netlify (HTTPS required for GPS + camera) |

---

## running locally

```bash
# serve the frontend
npx serve .

# run the signaling server (optional — for WebRTC peer discovery)
cd doesnt-matter-signal
pip install fastapi uvicorn
python -m uvicorn main:app --reload --port 8001
```

open `http://localhost:3000` in your browser.

GPS and camera require HTTPS — use Netlify or any HTTPS host for full functionality on a real device.

---

## contributing

this is open source because the people who need it most deserve to be able to audit it, fork it, and adapt it.

if you want to contribute:
- **translations** — open an issue with the language. safety-critical text must be verified by a native speaker before it goes in. no machine translation for instructions that could get someone killed.
- **features** — open an issue first, discuss before building
- **bugs** — open an issue with steps to reproduce
- **security** — if you find something serious, open a private security advisory on GitHub, not a public issue

languages needed most urgently: Arabic, Ukrainian, Burmese, Somali, Haitian Creole, Farsi, Pashto, Swahili, French, Russian, Spanish.

---

## license

MIT. take it, fork it, adapt it, deploy it. if you use it to help people in a crisis, you don't need to tell us. just help them.

---

## who

built by **The Wraith**.

this is a [razielliminal](https://github.com/razielliminal) project.

<!-- 
  you read everything. most people don't.
  this is also by the creator of persephone and cerberus.
  if you know, you know.
-->