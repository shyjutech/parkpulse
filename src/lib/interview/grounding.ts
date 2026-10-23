export interface GroundingQuestion {
  text: string;
}

export type TurnPlan =
  | { kind: "grounded"; question: string; index: number }
  | { kind: "generic" }
  | { kind: "done" };

/**
 * Decides, deterministically, what the next turn is — never by asking the
 * model to self-report whether it drew on real data, which wouldn't be
 * reliably honest. `messageCount` (how many questions have already been
 * served, read from the database, never trusted from the client) indexes
 * straight into `grounding`: real candidate questions are served first, in
 * order, verbatim and with no model call; once the list is exhausted,
 * questions are generic.
 */
export function planNextTurn(messageCount: number, grounding: GroundingQuestion[], maxQ: number): TurnPlan {
  if (messageCount >= maxQ) return { kind: "done" };
  if (messageCount < grounding.length) {
    return { kind: "grounded", question: grounding[messageCount].text, index: messageCount };
  }
  return { kind: "generic" };
}
