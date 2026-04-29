// TODO: produce a customer-facing draft, an internal-notes block, and a
// verify gate with explicit checkboxes. The verify gate is non-negotiable
// — AI drafts; a human signs it off before anything reaches the customer.

export async function draftReply(ticket) {
  return {
    todo: true,
    note: "Draft Reply is not wired up yet — produces a placeholder draft and verify gate.",
    ticket_id: ticket.id,
    customer_facing: `Hi <customer>,\n\n[NEEDS HUMAN INPUT: stub.]\n\nThanks,\n<your name>`,
    internal_notes: "[NEEDS HUMAN INPUT: stub.]",
    verify_gate: [
      "Customer name and contact correct",
      "No internal system names or jargon",
      "Owners and dates are real (not placeholders)",
      "No commitment we can't keep",
      "Workaround tested or labelled untested",
      "No PII or other-customer references",
    ],
  };
}
