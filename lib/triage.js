import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

const SYSTEM_PROMPT = `You are an Elemica support triage assistant. Classify the ticket into category and severity, identify the target systems involved, and call out assumptions and unverified facts. Respond with JSON only.

Categories: edi-mapping, xcarrier-change, escalation, idx-extraction, infra-cloud, sap-request, legacy-deployment.
Severity: low, medium, high, urgent.

Target systems should be specific and operational (e.g. "Elemica Network", "IDoc → 947 X12 reusable map", "SAP Cloud Connector v2.16.4", "ora2pg", "RabbitMQ consumer thread pool"). Surface the assumptions you are making and anything you cannot verify from the ticket text alone.`;

const SCHEMA = {
  type: "object",
  properties: {
    ticket_id: { type: "string" },
    category: { type: "string" },
    severity: { type: "string", enum: ["low", "medium", "high", "urgent"] },
    target_systems: { type: "array", items: { type: "string" } },
    summary: { type: "string" },
    assumptions: { type: "array", items: { type: "string" } },
    unverified: { type: "array", items: { type: "string" } },
  },
  required: [
    "ticket_id",
    "category",
    "severity",
    "target_systems",
    "summary",
    "assumptions",
    "unverified",
  ],
  additionalProperties: false,
};

export async function triage(ticket) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      todo: true,
      note: "ANTHROPIC_API_KEY is not set. Add it to .env and restart `npm start`.",
      ticket_id: ticket.id,
      category: ticket.category || "unknown",
      severity: ticket.severity || "medium",
      target_systems: [],
      summary: ticket.subject,
      assumptions: [],
      unverified: ["everything — no API key configured"],
    };
  }

  const userPrompt = `Ticket id: ${ticket.id}
Subject: ${ticket.subject}
Reporter: ${ticket.reporter}
Reported category: ${ticket.category}
Reported severity: ${ticket.severity}

Body:
${ticket.body}`;

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
      _usage: {
        input_tokens: response.usage?.input_tokens ?? 0,
        output_tokens: response.usage?.output_tokens ?? 0,
      },
    };
  } catch (error) {
    return {
      error: true,
      ticket_id: ticket.id,
      message: error?.message || "Triage call failed.",
    };
  }
}
