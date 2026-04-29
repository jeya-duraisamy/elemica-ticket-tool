// ─── shared helpers ──────────────────────────────────────────────────────────
const fmtDate = (iso) => {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

const escapeHtml = (s = "") =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

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
    list.innerHTML = filtered.map(rowHTML).join("") || `<div style="color:var(--muted);text-align:center;padding:40px;font-size:.9rem">no tickets match.</div>`;
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
  if (!id) { root.innerHTML = `<p style="color:var(--muted)">missing ?id= param</p>`; return; }

  const t = await fetch(`/api/tickets/${encodeURIComponent(id)}`).then((r) => r.ok ? r.json() : null);
  if (!t) { root.innerHTML = `<p style="color:var(--muted)">ticket not found.</p>`; return; }

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

        <h3 style="font-size:.78rem;color:var(--muted);letter-spacing:1.5px;text-transform:uppercase;margin-bottom:12px">AI actions</h3>

        <div class="todo-grid">
          <button class="todo-btn" data-action="triage">
            <div class="ic">🤖</div>
            <div class="name">AI Triage</div>
            <div class="desc">Classify, route, and flag assumptions</div>
          </button>
          <button class="todo-btn" data-action="pr-form">
            <div class="ic">📋</div>
            <div class="name">Generate PR Form</div>
            <div class="desc">Bottom-up estimate for the change request</div>
          </button>
          <button class="todo-btn" data-action="similar">
            <div class="ic">🔍</div>
            <div class="name">Find Similar</div>
            <div class="desc">Match against past tickets in the queue</div>
          </button>
          <button class="todo-btn" data-action="reply">
            <div class="ic">💬</div>
            <div class="name">Draft Reply</div>
            <div class="desc">Customer-facing draft with a verify gate</div>
          </button>
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
          <h3>About the AI actions</h3>
          <p style="font-size:.84rem;color:var(--text);line-height:1.65">
            Each button on the left runs a small AI helper against this ticket. The result lands in the panel below the buttons. Anything an AI produces is a draft — a human always reviews it before it leaves the team.
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

async function runTriage(btn, id) {
  const result = document.getElementById("result");
  btn.classList.add("loading");
  result.classList.add("on");
  result.innerHTML = `<h3>🤖 AI Triage <span class="pill">running…</span></h3>`;
  try {
    const data = await fetch(`/api/tickets/${encodeURIComponent(id)}/triage`, { method: "POST" }).then((r) => r.json());
    if (data.error) {
      result.innerHTML = `<h3>🤖 AI Triage <span class="pill" style="background:var(--red-soft);color:var(--red);border-color:var(--red-border)">error</span></h3><div class="verdict-error">${escapeHtml(data.message || "Triage failed.")}</div>`;
      return;
    }
    const isStub = data.todo === true;
    result.innerHTML = `
      <h3>🤖 AI Triage <span class="pill ${isStub ? '' : 'done'}">${isStub ? "stub" : "live"}</span></h3>
      ${isStub ? `<div class="stub-note">⚠ ${escapeHtml(data.note || "Triage is not wired up — placeholder verdict below.")}</div>` : ""}
      ${verdictHTML(data)}
      <div class="verdict-cta">
        <button class="btn-primary draft-resolution-btn" type="button">🪄 Draft Resolution</button>
      </div>
      <div class="resolution-mount" id="resolution-mount"></div>
    `;
    const drBtn = result.querySelector(".draft-resolution-btn");
    if (drBtn) drBtn.addEventListener("click", () => loadResolution(drBtn, id, data));
  } catch (err) {
    result.innerHTML = `<h3>🤖 AI Triage <span class="pill" style="background:var(--red-soft);color:var(--red);border-color:var(--red-border)">error</span></h3><div class="verdict-error">${escapeHtml(String(err))}</div>`;
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
  const noneLine = `<p class="verdict-none">none</p>`;
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
  btn.textContent = "🪄 Drafting…";
  try {
    const triagePayload = { ...triageData };
    delete triagePayload._usage;
    const draft = await fetch("/api/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticket_id: ticketId, triage: triagePayload }),
    }).then((r) => r.json());
    if (draft.error) {
      mount.innerHTML = `<div class="verdict-error">${escapeHtml(draft.message || "Draft Resolution failed.")}</div>`;
      btn.disabled = false;
      btn.textContent = "🪄 Draft Resolution";
      return;
    }
    btn.style.display = "none";
    renderResolutionPanel(mount, ticketId, draft);
  } catch (err) {
    mount.innerHTML = `<div class="verdict-error">${escapeHtml(String(err))}</div>`;
    btn.disabled = false;
    btn.textContent = "🪄 Draft Resolution";
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
        <h3>🪄 Resolution Draft <span class="pill ${isStub ? '' : 'done'}">${isStub ? "stub" : "live"}</span></h3>
        ${conf !== null ? `<span class="confidence-badge" data-level="${conf >= 75 ? 'high' : conf >= 50 ? 'med' : 'low'}">${conf}% confidence</span>` : ""}
      </div>
      ${isStub ? `<div class="stub-note">⚠ ${escapeHtml(draft.note || "Resolution is not wired up — placeholder draft below.")}</div>` : ""}

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
        <div class="res-label">Commands <span class="res-hint">CLI / SQL / API — one per line</span></div>
        <ul class="res-commands" id="res-commands">
          ${commands.length
            ? commands.map((c, i) => `<li><input class="res-input res-mono" data-i="${i}" value="${escapeHtml(c)}" /></li>`).join("")
            : `<li class="verdict-none">no commands</li>`}
        </ul>
      </div>

      <div class="res-section">
        <label class="res-label" for="res-client">Client message <span class="res-hint">customer-facing reply (blank if internal-only)</span></label>
        <textarea class="res-input res-textarea" id="res-client" rows="5">${escapeHtml(draft.client_message || "")}</textarea>
      </div>

      ${unverified.length ? `
        <div class="res-section">
          <div class="res-label">Unverified — must confirm before approving</div>
          <ul class="verdict-list verdict-unverified">${unverified.map((u) => `<li>${escapeHtml(u)}</li>`).join("")}</ul>
        </div>
      ` : ""}

      <div class="res-human-notice">⚠ Human review required before any commands run.</div>

      <label class="res-reviewed">
        <input type="checkbox" id="res-reviewed" /> I've reviewed this draft
      </label>

      <div class="res-actions">
        <button class="btn-primary res-approve" id="res-approve" disabled>Approve</button>
        <button class="btn-secondary res-edit" id="res-edit">Save Edit</button>
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
    if (!reviewer) { showStatus("Reviewer name required.", "err"); return null; }
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
      showStatus(`Failed to record: ${String(err)}`, "err");
      return null;
    }
  };

  approveBtn.addEventListener("click", async () => {
    if (approveBtn.disabled) return;
    const saved = await post("approve");
    if (!saved) return;
    showStatus(`Approved by ${saved.reviewer} at ${new Date(saved.timestamp).toLocaleString()}`, "ok");
    lockResolutionPanel(mount);
  });

  mount.querySelector("#res-edit").addEventListener("click", async () => {
    const saved = await post("edit");
    if (!saved) return;
    showStatus(`Edit saved by ${saved.reviewer} at ${new Date(saved.timestamp).toLocaleString()}`, "ok");
  });

  mount.querySelector("#res-reject").addEventListener("click", async () => {
    const reason = (prompt("Reason for rejecting this draft?") || "").trim();
    if (!reason) { showStatus("Reject cancelled — reason required.", "err"); return; }
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

async function runAction(btn, id, action) {
  const result = document.getElementById("result");
  btn.classList.add("loading");
  result.classList.add("on");
  result.innerHTML = `<h3>${labelForAction(action)} <span class="pill">running…</span></h3>`;
  try {
    const data = await fetch(`/api/tickets/${encodeURIComponent(id)}/${action}`, { method: "POST" }).then((r) => r.json());
    const isStub = data.todo === true;
    result.innerHTML = `
      <h3>${labelForAction(action)} <span class="pill ${isStub ? '' : 'done'}">${isStub ? "stub" : "live"}</span></h3>
      ${isStub ? `<div class="stub-note">⚠ ${escapeHtml(data.note || "This action is not wired up yet — placeholder output below.")}</div>` : ""}
      <pre>${escapeHtml(JSON.stringify(data, null, 2))}</pre>
    `;
  } catch (err) {
    result.innerHTML = `<h3>${labelForAction(action)} <span class="pill" style="background:var(--red-soft);color:var(--red);border-color:var(--red-border)">error</span></h3><pre>${escapeHtml(String(err))}</pre>`;
  } finally {
    btn.classList.remove("loading");
  }
}

const labelForAction = (a) => ({
  "triage": "🤖 AI Triage",
  "pr-form": "📋 Generate PR Form",
  "similar": "🔍 Find Similar",
  "reply": "💬 Draft Reply",
}[a] || a);

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
      alert("could not save ticket — see server logs");
    }
  });
}
