import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

const SYSTEM_PROMPT = `You are an Elemica support resolution drafter. Given a ticket and its triage classification, produce a draft resolution that an engineer can review and act on.

Return JSON with these fields:
- summary: one sentence describing the proposed resolution.
- steps: numbered, concrete actions for the engineer to take, in order. Be specific.
- commands: CLI / SQL / API calls the engineer would run, one per array item. Empty array if none apply.
- client_message: a customer-facing reply if applicable. Empty string if internal-only.
- confidence: number between 0 and 1 representing your confidence the steps will resolve the issue.
- unverified: assumptions the engineer must verify before acting. Be specific.

Rules:
- Never invent system names, customer names, IDs, or version numbers not present in the ticket or triage.
- Prefer non-destructive steps. If a destructive step is required, flag it in steps and unverified.
- Do not include "approve before running" boilerplate; the platform gates approval.

Respond with JSON only.`;

const SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    steps: { type: "array", items: { type: "string" } },
    commands: { type: "array", items: { type: "string" } },
    client_message: { type: "string" },
    confidence: { type: "number" },
    unverified: { type: "array", items: { type: "string" } },
  },
  required: ["summary", "steps", "commands", "client_message", "confidence", "unverified"],
  additionalProperties: false,
};

export async function draftResolution(ticket, triage = {}) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      todo: true,
      note: "ANTHROPIC_API_KEY is not set. Add it to .env and restart `npm start`.",
      summary: `Draft resolution for ${ticket.id} (placeholder)`,
      steps: [
        "Reproduce the issue described in the ticket against a non-production environment.",
        "Confirm the triage classification is correct.",
        "Apply the fix; verify against the customer's reproduction steps.",
      ],
      commands: [],
      client_message: "",
      confidence: 0,
      unverified: ["everything — no API key configured"],
      requires_human: true,
    };
  }

  const userPrompt = `Ticket id: ${ticket.id}
Subject: ${ticket.subject}
Reporter: ${ticket.reporter}
Reported category: ${ticket.category}
Reported severity: ${ticket.severity}

Body:
${ticket.body}

Triage:
- category: ${triage.category ?? "(unknown)"}
- severity: ${triage.severity ?? "(unknown)"}
- summary: ${triage.summary ?? "(none)"}
- target systems: ${(triage.target_systems || []).join(", ") || "(none)"}
- assumptions:
${(triage.assumptions || []).map((a) => "  - " + a).join("\n") || "  (none)"}
- unverified from triage:
${(triage.unverified || []).map((u) => "  - " + u).join("\n") || "  (none)"}`;

  try {
    const response = await client.messages.create({
      model: "claude-opus-4-7",
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
      output_config: {
        format: { type: "json_schema", schema: SCHEMA },
      },
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock) throw new Error("Anthropic response had no text block");
    return {
      ...JSON.parse(textBlock.text),
      requires_human: true,
      _usage: {
        input_tokens: response.usage?.input_tokens ?? 0,
        output_tokens: response.usage?.output_tokens ?? 0,
      },
    };
  } catch (error) {
    return {
      error: true,
      ticket_id: ticket.id,
      message: error?.message || "Draft Resolution call failed.",
    };
  }
}
