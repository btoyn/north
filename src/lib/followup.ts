/**
 * Opportunity follow-up sequence (spec §25).
 *
 * After Sources & Uses is sent: follow up at day 7, 14, and 21 with escalating
 * intent; after 3 unanswered follow-ups the opportunity moves to Dormant.
 * A partner response reopens it automatically; custom future dates allowed.
 */

export const MAX_FOLLOW_UP_ATTEMPTS = 3;
export const FOLLOW_UP_INTERVAL_DAYS = 7;

export type FollowUpStep =
  | { kind: "follow_up"; attempt: 1 | 2 | 3; dueAt: Date; tone: string }
  | { kind: "go_dormant" };

/**
 * Given when Sources & Uses was sent and how many unanswered follow-ups have
 * already happened, return the next step in the sequence.
 */
export function nextFollowUpStep(
  sentAt: Date | string,
  attemptsMade: number,
): FollowUpStep {
  if (attemptsMade >= MAX_FOLLOW_UP_ATTEMPTS) return { kind: "go_dormant" };

  const sent = typeof sentAt === "string" ? new Date(sentAt) : sentAt;
  const attempt = (attemptsMade + 1) as 1 | 2 | 3;
  const dueAt = new Date(
    sent.getTime() + attempt * FOLLOW_UP_INTERVAL_DAYS * 86_400_000,
  );

  const tones: Record<number, string> = {
    1: "Casual check-in",
    2: "Ask whether the deal remains active",
    3: "Final follow-up and close for now",
  };

  return { kind: "follow_up", attempt, dueAt, tone: tones[attempt] };
}

export const OPPORTUNITY_STAGES = [
  { value: "initial_inquiry", label: "Initial inquiry" },
  { value: "sources_uses_sent", label: "Sources & Uses sent" },
  { value: "needs_list_sent", label: "Needs list sent" },
  { value: "documents_pending", label: "Documents pending" },
  { value: "ready_for_preflight", label: "Ready for preflight" },
  { value: "handed_off", label: "Handed off to preflight" },
  { value: "dormant", label: "Dormant / no response" },
  { value: "closed_no_handoff", label: "Closed without handoff" },
] as const;
