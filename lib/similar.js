// TODO: given a ticket, return up to 5 similar past tickets ordered by
// relevance with a short reason for each match. Simplest version uses
// keyword overlap; better versions use embeddings or let Claude rank.

export async function findSimilar(ticket, allTickets) {
  // Naïve baseline: exact category match, excluding self.
  const baseline = allTickets
    .filter((t) => t.id !== ticket.id && t.category === ticket.category)
    .slice(0, 5)
    .map((t) => ({ id: t.id, subject: t.subject, reason: `same category: ${t.category}` }));

  return {
    todo: true,
    note: "Find Similar is not wired up yet — currently only matches on category. Hook up an embedding or LLM ranker for real relevance.",
    ticket_id: ticket.id,
    matches: baseline,
  };
}
