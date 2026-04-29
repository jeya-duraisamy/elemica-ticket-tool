// ─── shared helpers ──────────────────────────────────────────────────────────
const fmtDate = (iso) => {
  if (!iso) return "—";
  return iso.slice(0, 10); // ISO 8601 — YYYY-MM-DD per Elemica brand
};

const fmtTimestamp = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  const date = iso.slice(0, 10);
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${date} ${time}`;
};

const escapeHtml = (s = "") =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const icon = (name, modifier = "icon-md") => `<span class="material-icons ${modifier}">${name}</span>`;

const ACTION_ICONS = {
  triage: "smart_toy",
  "pr-form": "description",
  similar: "search",
  reply: "chat",
};

const ACTION_LABELS = {
  triage: "AI triage",
  "pr-form": "Generate PR form",
  similar: "Find similar",
  reply: "Draft reply",
};

// ─── /  inbox ────────────────────────────────────────────────────────────────
async function renderInbox() {
  const list = document.getElementById("list");
  const count = document.getElementById("count");
  const q = document.getElementById("q");
  const chips = [...document.querySelectorAll(".chip")];
  let activeFilter = "all";

  const tickets = await fetch("/api/tickets").then((r) => r.json());

  const draw = () => {
    const term = (q.value || "").toLowerCase();
    const filtered = tickets.filter((t) => {
      if (activeFilter === "urgent" && t.severity !== "urgent") return false;
      if (activeFilter !== "all" && activeFilter !== "urgent" && t.category !== activeFilter) return false;
      if (term && !`${t.subject} ${t.body}`.toLowerCase().includes(term)) return false;
      return true;
    });
    count.textContent = filtered.length;
    list.innerHTML = filtered.map(rowHTML).join("") || `<div class="verdict-none" style="text-align:center;padding:40px">No tickets match the current filter.</div>`;
  };

  chips.forEach((c) => c.addEventListener("click", () => {
    chips.forEach((x) => x.classList.remove("on"));
    c.classList.add("on");
    activeFilter = c.dataset.filter;
    draw();
  }));
  q.addEventListener("input", draw);
  draw();
}

const rowHTML = (t) => `
  <div class="ticket-row">
    <div class="id">${t.id}</div>
    <div class="subject"><a href="/ticket.html?id=${encodeURIComponent(t.id)}">${escapeHtml(t.subject)}</a></div>
    <div><span class="tag cat-${t.category}">${t.category.replace("-", " ")}</span></div>
    <div><span class="sev sev-${t.severity}"><span class="sev-dot"></span>${t.severity}</span></div>
    <div class="reporter">${escapeHtml(t.reporter || "—")}</div>
  </div>
`;

// ─── /ticket.html ────────────────────────────────────────────────────────────
async function renderTicket() {
  const root = document.getElementById("ticket-root");
  const id = new URLSearchParams(location.search).get("id");
  if (!id) { root.innerHTML = `<p class="verdict-none">Missing ticket id.</p>`; return; }

  const t = await fetch(`/api/tickets/${encodeURIComponent(id)}`).then((r) => r.ok ? r.json() : null);
  if (!t) { root.innerHTML = `<p class="verdict-none">Ticket not found.</p>`; return; }

  root.innerHTML = `
    <div class="ticket-page">
      <div>
        <div class="ticket-header">
          <div class="id">${t.id}</div>
          <h1>${escapeHtml(t.subject)}</h1>
          <div class="meta">
            <span class="tag cat-${t.category}">${t.category.replace("-", " ")}</span>
            <span class="sev sev-${t.severity}"><span class="sev-dot"></span>${t.severity}</span>
            <span class="reporter">${escapeHtml(t.reporter || "—")}</span>
            <span>· ${fmtDate(t.created)}</span>
          </div>
        </div>

        <div class="ticket-body">${escapeHtml(t.body)}</div>

        <div class="verdict-label" style="margin-bottom:var(--elemica-space-m)">AI actions</div>

        <div class="todo-grid">
          ${["triage", "pr-form", "similar", "reply"].map((a) => `
            <button class="todo-btn" data-action="${a}">
              <div class="ic">${icon(ACTION_ICONS[a], "icon-lg")}</div>
              <div class="name">${ACTION_LABELS[a]}</div>
              <div class="desc">${ACTION_DESC[a]}</div>
            </button>
          `).join("")}
        </div>

        <div class="result-panel" id="result"></div>
      </div>

      <aside>
        <div class="side-card">
          <h3>Ticket meta</h3>
          <div class="row"><span class="k">id</span><span class="v">${t.id}</span></div>
          <div class="row"><span class="k">status</span><span class="v">${t.status || "open"}</span></div>
          <div class="row"><span class="k">created</span><span class="v">${fmtDate(t.created)}</span></div>
          <div class="row"><span class="k">category</span><span class="v">${t.category}</span></div>
          <div class="row"><span class="k">severity</span><span class="v">${t.severity}</span></div>
        </div>
        <div class="side-card">
          <h3>About AI actions</h3>
          <p style="font-size:14px;color:var(--elemica-color-text-secondary);line-height:1.6;letter-spacing:0.25px">
            Each action runs an AI helper against this ticket. Results appear in the panel below. AI output is a draft — a human reviews before it leaves the team.
          </p>
        </div>
      </aside>
    </div>
  `;

  document.querySelectorAll(".todo-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = btn.dataset.action;
      if (action === "triage") return runTriage(btn, t.id);
      return runAction(btn, t.id, action);
    });
  });
}

const ACTION_DESC = {
  triage: "Classify, route, and flag assumptions",
  "pr-form": "Bottom-up estimate for the change request",
  similar: "Match against past tickets in the queue",
  reply: "Customer-facing draft with a verify gate",
};

// ─── AI Triage ───────────────────────────────────────────────────────────────
const triageHeader = (pillClass, pillText) => `
  <h3>${icon("smart_toy", "icon-md")} AI triage <span class="pill ${pillClass}">${pillText}</span></h3>
`;

const errorHeader = (label) => `
  <h3>${label} <span class="pill" style="background:var(--elemica-color-error-soft);color:var(--elemica-color-error);border-color:var(--elemica-color-error-border)">error</span></h3>
`;

async function runTriage(btn, id) {
  const result = document.getElementById("result");
  btn.classList.add("loading");
  result.classList.add("on");
  result.innerHTML = triageHeader("", "Running");
  try {
    const data = await fetch(`/api/tickets/${encodeURIComponent(id)}/triage`, { method: "POST" }).then((r) => r.json());
    if (data.error) {
      result.innerHTML = `${errorHeader(`${icon("smart_toy", "icon-md")} AI triage`)}<div class="verdict-error">${escapeHtml(data.message || "Triage failed.")}</div>`;
      return;
    }
    const isStub = data.todo === true;
    result.innerHTML = `
      ${triageHeader(isStub ? "" : "done", isStub ? "Stub" : "Live")}
      ${isStub ? `<div class="stub-note">${icon("warning", "icon-inline")} ${escapeHtml(data.note || "Triage is not wired up — placeholder verdict below.")}</div>` : ""}
      ${verdictHTML(data)}
      <div class="verdict-cta">
        <button class="btn-primary draft-resolution-btn" type="button">${icon("auto_fix_high", "icon-inline")} Draft resolution</button>
      </div>
      <div class="resolution-mount" id="resolution-mount"></div>
    `;
    const drBtn = result.querySelector(".draft-resolution-btn");
    if (drBtn) drBtn.addEventListener("click", () => loadResolution(drBtn, id, data));
  } catch (err) {
    result.innerHTML = `${errorHeader(`${icon("smart_toy", "icon-md")} AI triage`)}<div class="verdict-error">${escapeHtml(String(err))}</div>`;
  } finally {
    btn.classList.remove("loading");
  }
}

const verdictHTML = (d) => {
  const cat = d.category || "unknown";
  const sev = d.severity || "medium";
  const summary = d.summary || "(no summary)";
  const targets = Array.isArray(d.target_systems) ? d.target_systems : [];
  const assumptions = Array.isArray(d.assumptions) ? d.assumptions : [];
  const unverified = Array.isArray(d.unverified) ? d.unverified : [];
  const noneLine = `<p class="verdict-none">None.</p>`;
  return `
    <div class="verdict-hero">
      <span class="tag tag-lg cat-${cat}">${escapeHtml(cat.replace("-", " "))}</span>
      <span class="sev sev-lg sev-${sev}"><span class="sev-dot"></span>${escapeHtml(sev)}</span>
      <p class="verdict-headline">${escapeHtml(summary)}</p>
    </div>

    <div class="verdict-section">
      <div class="verdict-label">Target systems</div>
      ${targets.length
        ? `<div class="verdict-chip-list">${targets.map((s) => `<span class="verdict-chip">${escapeHtml(s)}</span>`).join("")}</div>`
        : noneLine}
    </div>

    <div class="verdict-section">
      <div class="verdict-label">Assumptions</div>
      ${assumptions.length
        ? `<ol class="verdict-list">${assumptions.map((a) => `<li>${escapeHtml(a)}</li>`).join("")}</ol>`
        : noneLine}
    </div>

    <div class="verdict-section">
      <div class="verdict-label">Unverified — human must confirm</div>
      ${unverified.length
        ? `<ul class="verdict-list verdict-unverified">${unverified.map((u) => `<li>${escapeHtml(u)}</li>`).join("")}</ul>`
        : noneLine}
    </div>

    ${d._usage ? `<div class="verdict-usage">input ${d._usage.input_tokens} · output ${d._usage.output_tokens} tokens</div>` : ""}
  `;
};

// ─── Draft Resolution ────────────────────────────────────────────────────────
function getReviewer() {
  let r = localStorage.getItem("reviewer");
  if (!r) {
    r = (prompt("Your name (used as reviewer for resolution actions):") || "").trim();
    if (!r) return null;
    localStorage.setItem("reviewer", r);
  }
  return r;
}

async function loadResolution(btn, ticketId, triageData) {
  const mount = document.getElementById("resolution-mount");
  if (!mount) return;
  btn.disabled = true;
  btn.innerHTML = `${icon("auto_fix_high", "icon-inline")} Drafting`;
  try {
    const triagePayload = { ...triageData };
    delete triagePayload._usage;
    const draft = await fetch("/api/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticket_id: ticketId, triage: triagePayload }),
    }).then((r) => r.json());
    if (draft.error) {
      mount.innerHTML = `<div class="verdict-error">${escapeHtml(draft.message || "Draft resolution failed.")}</div>`;
      btn.disabled = false;
      btn.innerHTML = `${icon("auto_fix_high", "icon-inline")} Draft resolution`;
      return;
    }
    btn.style.display = "none";
    renderResolutionPanel(mount, ticketId, draft);
  } catch (err) {
    mount.innerHTML = `<div class="verdict-error">${escapeHtml(String(err))}</div>`;
    btn.disabled = false;
    btn.innerHTML = `${icon("auto_fix_high", "icon-inline")} Draft resolution`;
  }
}

function renderResolutionPanel(mount, ticketId, draft) {
  const isStub = draft.todo === true;
  const conf = typeof draft.confidence === "number" ? Math.round(draft.confidence * 100) : null;
  const steps = Array.isArray(draft.steps) ? draft.steps : [];
  const commands = Array.isArray(draft.commands) ? draft.commands : [];
  const unverified = Array.isArray(draft.unverified) ? draft.unverified : [];
  mount.innerHTML = `
    <div class="resolution-panel">
      <div class="resolution-head">
        <h3>${icon("auto_fix_high", "icon-md")} Resolution draft <span class="pill ${isStub ? '' : 'done'}">${isStub ? "Stub" : "Live"}</span></h3>
        ${conf !== null ? `<span class="confidence-badge" data-level="${conf >= 75 ? 'high' : conf >= 50 ? 'med' : 'low'}">${conf}% confidence</span>` : ""}
      </div>
      ${isStub ? `<div class="stub-note">${icon("warning", "icon-inline")} ${escapeHtml(draft.note || "Resolution is not wired up — placeholder draft below.")}</div>` : ""}

      <div class="res-section">
        <label class="res-label" for="res-summary">Summary</label>
        <textarea class="res-input res-textarea" id="res-summary" rows="2">${escapeHtml(draft.summary || "")}</textarea>
      </div>

      <div class="res-section">
        <div class="res-label">Steps <span class="res-hint">numbered, in order</span></div>
        <ol class="res-steps" id="res-steps">
          ${steps.map((s, i) => `<li><textarea class="res-input" data-i="${i}" rows="2">${escapeHtml(s)}</textarea></li>`).join("")}
        </ol>
      </div>

      <div class="res-section">
        <div class="res-label">Commands <span class="res-hint">CLI, SQL, or API — one per line</span></div>
        <ul class="res-commands" id="res-commands">
          ${commands.length
            ? commands.map((c, i) => `<li><input class="res-input res-mono" data-i="${i}" value="${escapeHtml(c)}" /></li>`).join("")
            : `<li class="verdict-none">No commands.</li>`}
        </ul>
      </div>

      <div class="res-section">
        <label class="res-label" for="res-client">Client message <span class="res-hint">customer-facing reply (blank if internal-only)</span></label>
        <textarea class="res-input res-textarea" id="res-client" rows="5">${escapeHtml(draft.client_message || "")}</textarea>
      </div>

      ${unverified.length ? `
        <div class="res-section">
          <div class="res-label">Unverified — confirm before approving</div>
          <ul class="verdict-list verdict-unverified">${unverified.map((u) => `<li>${escapeHtml(u)}</li>`).join("")}</ul>
        </div>
      ` : ""}

      <div class="res-human-notice">${icon("warning", "icon-inline")} Human review required before any commands run.</div>

      <label class="res-reviewed">
        <input type="checkbox" id="res-reviewed" /> I have reviewed this draft
      </label>

      <div class="res-actions">
        <button class="btn-primary res-approve" id="res-approve" disabled>Approve</button>
        <button class="btn-secondary res-edit" id="res-edit">Save edit</button>
        <button class="btn-secondary res-reject" id="res-reject">Reject</button>
      </div>

      <div class="res-status" id="res-status"></div>
    </div>
  `;

  const reviewedCheckbox = mount.querySelector("#res-reviewed");
  const approveBtn = mount.querySelector("#res-approve");
  reviewedCheckbox.addEventListener("change", () => {
    approveBtn.disabled = !reviewedCheckbox.checked;
  });

  const collectDraft = () => {
    const summary = mount.querySelector("#res-summary").value;
    const stepInputs = [...mount.querySelectorAll("#res-steps textarea")];
    const editedSteps = stepInputs.map((el) => el.value);
    const cmdInputs = [...mount.querySelectorAll("#res-commands input")];
    const editedCommands = cmdInputs.map((el) => el.value);
    const client_message = mount.querySelector("#res-client").value;
    return {
      ...draft,
      summary,
      steps: editedSteps,
      commands: editedCommands,
      client_message,
    };
  };

  const showStatus = (msg, kind = "ok") => {
    const status = mount.querySelector("#res-status");
    status.textContent = msg;
    status.dataset.kind = kind;
  };

  const post = async (action, extra = {}) => {
    const reviewer = getReviewer();
    if (!reviewer) { showStatus("Reviewer name is required.", "err"); return null; }
    const payload = {
      ticket_id: ticketId,
      action,
      reviewer,
      draft: collectDraft(),
      ...extra,
    };
    try {
      const res = await fetch("/api/resolutions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      showStatus(`Failed to record action: ${String(err)}`, "err");
      return null;
    }
  };

  approveBtn.addEventListener("click", async () => {
    if (approveBtn.disabled) return;
    const saved = await post("approve");
    if (!saved) return;
    showStatus(`Approved by ${saved.reviewer} on ${fmtTimestamp(saved.timestamp)}`, "ok");
    lockResolutionPanel(mount);
  });

  mount.querySelector("#res-edit").addEventListener("click", async () => {
    const saved = await post("edit");
    if (!saved) return;
    showStatus(`Edit saved by ${saved.reviewer} on ${fmtTimestamp(saved.timestamp)}`, "ok");
  });

  mount.querySelector("#res-reject").addEventListener("click", async () => {
    const reason = (prompt("Reason for rejecting this draft?") || "").trim();
    if (!reason) { showStatus("Rejection cancelled — a reason is required.", "err"); return; }
    const saved = await post("reject", { reject_reason: reason });
    if (!saved) return;
    showStatus(`Rejected by ${saved.reviewer}: ${reason}`, "warn");
    lockResolutionPanel(mount);
  });
}

function lockResolutionPanel(mount) {
  mount.querySelectorAll(".res-input").forEach((el) => el.setAttribute("disabled", ""));
  mount.querySelectorAll(".res-actions button").forEach((b) => b.setAttribute("disabled", ""));
  const cb = mount.querySelector("#res-reviewed");
  if (cb) cb.setAttribute("disabled", "");
}

// ─── Other AI actions (still JSON dump until each is wired) ─────────────────
async function runAction(btn, id, action) {
  const result = document.getElementById("result");
  btn.classList.add("loading");
  result.classList.add("on");
  result.innerHTML = `<h3>${icon(ACTION_ICONS[action] || "settings", "icon-md")} ${ACTION_LABELS[action] || action} <span class="pill">Running</span></h3>`;
  try {
    const data = await fetch(`/api/tickets/${encodeURIComponent(id)}/${action}`, { method: "POST" }).then((r) => r.json());
    const isStub = data.todo === true;
    result.innerHTML = `
      <h3>${icon(ACTION_ICONS[action] || "settings", "icon-md")} ${ACTION_LABELS[action] || action} <span class="pill ${isStub ? '' : 'done'}">${isStub ? "Stub" : "Live"}</span></h3>
      ${isStub ? `<div class="stub-note">${icon("warning", "icon-inline")} ${escapeHtml(data.note || "This action is not wired up yet — placeholder output below.")}</div>` : ""}
      <pre>${escapeHtml(JSON.stringify(data, null, 2))}</pre>
    `;
  } catch (err) {
    result.innerHTML = `${errorHeader(`${icon(ACTION_ICONS[action] || "settings", "icon-md")} ${ACTION_LABELS[action] || action}`)}<pre>${escapeHtml(String(err))}</pre>`;
  } finally {
    btn.classList.remove("loading");
  }
}

// ─── /submit.html ────────────────────────────────────────────────────────────
function wireSubmit() {
  const form = document.getElementById("submit-form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const body = Object.fromEntries(fd.entries());
    const res = await fetch("/api/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const t = await res.json();
      location.href = `/ticket.html?id=${encodeURIComponent(t.id)}`;
    } else {
      alert("Could not save the ticket. Check the server logs.");
    }
  });
}
