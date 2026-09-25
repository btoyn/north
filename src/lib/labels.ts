/** Plain-language labels (spec §1: no CRM jargon). */

export const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  personal_email: "Personal email",
  campaign_email: "Campaign email",
  incoming_email: "Incoming email",
  text: "Text",
  call: "Call",
  lunch: "Lunch",
  breakfast: "Breakfast",
  golf: "Golf",
  office_visit: "Office visit",
  pop_in: "Pop-in",
  drop_off: "Drop-off",
  general_meeting: "Meeting",
  sba_question: "SBA question",
  deal_conversation: "Deal conversation",
  loan_update: "Loan update",
  note: "Note",
  task_completed: "Task completed",
  other: "Other",
};

export const ROLE_TYPE_LABELS: Record<string, string> = {
  commercial_lender: "Commercial lender",
  commercial_lending_manager: "Lending manager",
  branch_manager: "Branch manager",
  credit_underwriting: "Credit / underwriting",
  executive: "Executive",
  other_bank_employee: "Bank employee",
};

export const TIER_LABELS: Record<string, string> = {
  A: "Tier A",
  B: "Tier B",
  C: "Tier C",
  unassigned: "No tier",
};

export const HEALTH_LABELS: Record<string, string> = {
  strong: "Strong",
  steady: "Steady",
  cooling: "Cooling",
  at_risk: "At risk",
  new: "New",
};

export const COMMUNICATION_STYLE_LABELS: Record<string, string> = {
  casual_conversational: "Casual & conversational",
  warm_professional: "Warm & professional",
  direct_concise: "Direct & concise",
  formal_when_needed: "Formal when needed",
};

export const PERSONAL_DETAIL_CATEGORY_LABELS: Record<string, string> = {
  long_term_interest: "Interest",
  life_event: "Life event",
  family: "Family",
  sports: "Sports",
  golf: "Golf",
  restaurant: "Restaurant",
  community: "Community",
  communication_preference: "How they like to communicate",
  meeting_preference: "Meeting preference",
  follow_up_topic: "Follow-up topic",
  other: "Other",
};

export const MEETING_TYPE_LABELS: Record<string, string> = {
  lunch: "Lunch",
  breakfast: "Breakfast",
  golf: "Golf",
  office_visit: "Office visit",
  pop_in: "Pop-in",
  general: "Meeting",
};

/** Default durations in minutes (spec §8). */
export const MEETING_TYPE_DURATIONS: Record<string, number | null> = {
  lunch: 60,
  breakfast: 60,
  golf: 150,
  office_visit: 15,
  pop_in: 15,
  general: null,
};

export const LOAN_STAGE_LABELS: Record<string, string> = {
  processing: "Processing",
  underwriting: "Underwriting",
  board_approved: "Board approved",
  sba_approved: "SBA approved",
};

export const OPPORTUNITY_STAGE_LABELS: Record<string, string> = {
  initial_inquiry: "Initial inquiry",
  sources_uses_sent: "Sources & Uses sent",
  needs_list_sent: "Needs list sent",
  documents_pending: "Documents pending",
  ready_for_preflight: "Ready for preflight",
  handed_off: "Handed off to preflight",
  dormant: "Dormant / no response",
  closed_no_handoff: "Closed without handoff",
};

export const TERRITORIES = [
  "Northern Utah",
  "Wasatch Front",
  "Southern Utah",
  "Other",
] as const;

/** Timeline filters on a partner, shared by the page and the slide-over. */
export const TIMELINE_FILTERS = [
  { key: "all", label: "All activity" },
  { key: "personal", label: "Personal interactions" },
  { key: "deals", label: "Deals & loans" },
  { key: "notes", label: "Notes & promises" },
  { key: "campaigns", label: "Campaigns" },
] as const;
