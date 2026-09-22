/** Row shapes for the tables the app reads. Kept by hand until the Supabase
 *  project exists to generate types from. */

export interface Lender {
  id: string;
  user_id: string;
  institution_id: string | null;
  first_name: string;
  last_name: string | null;
  full_name: string;
  title: string | null;
  role_type: string;
  email: string | null;
  mobile_phone: string | null;
  office_phone: string | null;
  city: string | null;
  state: string | null;
  territory: string | null;
  relationship_tier: string;
  relationship_health: string | null;
  communication_style: string | null;
  preferred_contact_method: string | null;
  active: boolean;
  do_not_contact: boolean;
  unsubscribed: boolean;
  email_bounced: boolean;
  needs_enrichment: boolean;
  next_follow_up_at: string | null;
  notes: string | null;
  is_sample: boolean;
  created_at: string;
  deleted_at: string | null;
}

export interface Institution {
  id: string;
  name: string;
  normalized_name: string;
  website: string | null;
  main_phone: string | null;
  city: string | null;
  state: string | null;
  territory: string | null;
  notes: string | null;
  is_sample: boolean;
  deleted_at: string | null;
}

export interface Activity {
  id: string;
  lender_id: string | null;
  activity_type: string;
  direction: string;
  occurred_at: string;
  subject: string | null;
  summary: string | null;
  details: string | null;
  personal_touch: boolean;
  counts_for_coverage: boolean;
  is_sample: boolean;
}

export interface Task {
  id: string;
  lender_id: string | null;
  task_type: string;
  title: string;
  description: string | null;
  due_at: string | null;
  status: string;
  priority: string;
  snoozed_until: string | null;
}

export interface Promise_ {
  id: string;
  lender_id: string | null;
  direction: "i_promised" | "they_promised";
  description: string;
  due_at: string | null;
  status: string;
}

export interface PersonalDetail {
  id: string;
  lender_id: string;
  category: string;
  detail: string;
  captured_date: string;
}

export interface CoverageRow {
  lender_id: string;
  last_visible_touch_at: string | null;
  last_personal_touch_at: string | null;
  /** Only what someone else took part in — the bar A and B are held to. */
  last_conversation_at: string | null;
  last_deal_update_at: string | null;
  has_confirmed_future_meeting: boolean;
}

export interface UserPreferences {
  user_id: string;
  default_contact_goal_days: number;
  contact_grace_days: number;
  weekly_top_count: number;
  weekly_on_deck_count: number;
  default_campaign_batch_size: number;
  daily_digest_enabled: boolean;
  daily_digest_time: string;
  ai_enabled: boolean;
}
