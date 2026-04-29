# Elemica Ticket Tool

A small internal inbox for support tickets at Elemica. Tickets land here, the team picks them up, and AI helpers assist with classification, similar-ticket search, draft replies, and the formal change-request form. Every AI output is a draft — a human always reviews before anything goes out.

---

## Quick start

```bash
git clone <this-repo-url>
cd elemica-ticket-tool
npm install
npm start
# → open http://localhost:3000
```

You should see a dark ticket inbox with ten mock tickets. Requires Node 20+.

To enable the live AI actions, copy `.env.example` to `.env` and fill in `ANTHROPIC_API_KEY`. Without it the AI buttons return placeholder output.

---

## What's built

- **Ticket inbox** (`/`) — sortable, filterable list of incoming tickets
- **Single ticket view** (`/ticket?id=…`) — full ticket detail with four AI action buttons
- **Submit form** (`/submit`) — paste a new ticket into the system
- **Express API** — `GET/POST /api/tickets`, plus four AI action endpoints
- **Render config** — one-click deploy via `render.yaml`
- **Mock data** — ten realistic Elemica tickets covering EDI / XCarrier / SAP / IDX / cloud

## What's not wired up yet

| Button | Endpoint | Lives in | What it should do |
|---|---|---|---|
| 🤖 **AI Triage** | `POST /api/tickets/:id/triage` | `lib/triage.js` | Classify category, severity, target system. (Wired up — calls Anthropic if `ANTHROPIC_API_KEY` is set.) |
| 📋 **Generate PR Form** | `POST /api/tickets/:id/pr-form` | `lib/pr-form.js` | Produce a PR-to-SOW form with bottom-up estimate. |
| 🔍 **Find Similar** | `POST /api/tickets/:id/similar` | `lib/similar.js` | Search ticket history for related issues. |
| 💬 **Draft Reply** | `POST /api/tickets/:id/reply` | `lib/reply.js` | Customer-facing draft, gated by human verification. |

Each unwired action returns `{todo: true, …}` with a placeholder response so the UI keeps working.

---

## Repo layout

```
elemica-ticket-tool/
├── README.md
├── server.js                  ← Express server, all routes
├── package.json
├── render.yaml                ← Render auto-deploy config
├── .env.example
├── data/
│   └── tickets.json           ← mock Elemica tickets (anonymized)
├── public/
│   ├── index.html             ← ticket inbox
│   ├── ticket.html            ← single ticket + action buttons
│   ├── submit.html            ← submit form
│   ├── styles.css
│   └── app.js
└── lib/
    ├── triage.js              ← AI Triage (wired up)
    ├── pr-form.js             ← TODO
    ├── similar.js             ← TODO (baseline category match only)
    └── reply.js               ← TODO
```

---

## Stack

- Node 20+ runtime
- Express — single file, ~80 lines
- No build step — vanilla HTML / CSS / JS in `public/`
- JSON file as the database — `data/tickets.json` is the source of truth
- Anthropic Messages API for AI actions (`@anthropic-ai/sdk`)
- Render for deployment — free tier, GitHub auto-deploy

Why no React/build pipeline: every line in this repo is meant to be readable in 30 seconds.
