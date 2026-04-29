// TODO: produce a filled PR-to-SOW form with a bottom-up effort estimate
// (discovery / build / test / deploy / support). Feed the ticket into the
// Messages API with a system prompt and return markdown the UI can render.

export async function generatePrForm(ticket) {
  return {
    todo: true,
    note: "Generate PR Form is not wired up yet — produces a placeholder.",
    ticket_id: ticket.id,
    markdown: `# PR Form — ${ticket.id}\n\n[Placeholder — lib/pr-form.js is not wired up yet.]`,
  };
}
