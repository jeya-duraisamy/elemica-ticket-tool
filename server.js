import express from "express";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { triage } from "./lib/triage.js";
import { generatePrForm } from "./lib/pr-form.js";
import { findSimilar } from "./lib/similar.js";
import { draftReply } from "./lib/reply.js";
import { draftResolution } from "./lib/resolve.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, "data", "tickets.json");
const RESOLUTIONS_PATH = join(__dirname, "data", "resolutions.json");

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static(join(__dirname, "public")));

const loadTickets = async () => JSON.parse(await readFile(DATA_PATH, "utf8"));
const saveTickets = async (t) => writeFile(DATA_PATH, JSON.stringify(t, null, 2));

const loadResolutions = async () => {
  try { return JSON.parse(await readFile(RESOLUTIONS_PATH, "utf8")); }
  catch (e) { if (e.code === "ENOENT") return []; throw e; }
};
const saveResolutions = async (r) => writeFile(RESOLUTIONS_PATH, JSON.stringify(r, null, 2));

// ─── REST: tickets ─────────────────────────────────────────────────────────
app.get("/api/tickets", async (_req, res) => {
  const tickets = await loadTickets();
  res.json(tickets);
});

app.get("/api/tickets/:id", async (req, res) => {
  const tickets = await loadTickets();
  const t = tickets.find((x) => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: "ticket not found" });
  res.json(t);
});

app.post("/api/tickets", async (req, res) => {
  const { subject, body, category = "unknown", severity = "medium", reporter = "self" } = req.body ?? {};
  if (!subject || !body) return res.status(400).json({ error: "subject and body are required" });
  const tickets = await loadTickets();
  const id = `TKT-${String(Date.now()).slice(-6)}`;
  const ticket = { id, subject, body, category, severity, reporter, status: "open", created: new Date().toISOString() };
  tickets.unshift(ticket);
  await saveTickets(tickets);
  res.status(201).json(ticket);
});

// ─── AI action endpoints ───────────────────────────────────────────────────
app.post("/api/tickets/:id/triage", async (req, res) => {
  const tickets = await loadTickets();
  const ticket = tickets.find((x) => x.id === req.params.id);
  if (!ticket) return res.status(404).json({ error: "ticket not found" });
  const result = await triage(ticket);
  res.json(result);
});

app.post("/api/tickets/:id/pr-form", async (req, res) => {
  const tickets = await loadTickets();
  const ticket = tickets.find((x) => x.id === req.params.id);
  if (!ticket) return res.status(404).json({ error: "ticket not found" });
  const result = await generatePrForm(ticket);
  res.json(result);
});

app.post("/api/tickets/:id/similar", async (req, res) => {
  const tickets = await loadTickets();
  const ticket = tickets.find((x) => x.id === req.params.id);
  if (!ticket) return res.status(404).json({ error: "ticket not found" });
  const result = await findSimilar(ticket, tickets);
  res.json(result);
});

app.post("/api/tickets/:id/reply", async (req, res) => {
  const tickets = await loadTickets();
  const ticket = tickets.find((x) => x.id === req.params.id);
  if (!ticket) return res.status(404).json({ error: "ticket not found" });
  const result = await draftReply(ticket);
  res.json(result);
});

// ─── Draft Resolution ──────────────────────────────────────────────────────
app.post("/api/resolve", async (req, res) => {
  const { ticket_id, triage: triageResult } = req.body ?? {};
  if (!ticket_id) return res.status(400).json({ error: "ticket_id is required" });
  const tickets = await loadTickets();
  const ticket = tickets.find((x) => x.id === ticket_id);
  if (!ticket) return res.status(404).json({ error: "ticket not found" });
  const draft = await draftResolution(ticket, triageResult ?? {});
  res.json(draft);
});

app.post("/api/resolutions", async (req, res) => {
  const { ticket_id, action, reviewer, draft, reject_reason } = req.body ?? {};
  if (!ticket_id || !action || !reviewer) {
    return res.status(400).json({ error: "ticket_id, action, and reviewer are required" });
  }
  if (!["approve", "edit", "reject"].includes(action)) {
    return res.status(400).json({ error: "action must be approve | edit | reject" });
  }
  const entry = {
    ticket_id,
    action,
    reviewer,
    timestamp: new Date().toISOString(),
    draft: draft ?? null,
    reject_reason: action === "reject" ? (reject_reason ?? null) : null,
  };
  const all = await loadResolutions();
  all.push(entry);
  await saveResolutions(all);
  res.status(201).json(entry);
});

// ─── boot ──────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`elemica-ticket-tool · http://localhost:${PORT}`);
});
