/**
 * What the Microsoft connection needs to exist, and what it asks for.
 *
 * Nothing here reaches the network. It reads environment and builds URLs, so
 * the whole integration can be wired up and reasoned about before anyone
 * registers an app in Entra.
 */

/** Delegated Graph scopes, and what each one buys. */
export const MICROSOFT_SCOPES = [
  "offline_access", // refresh tokens — it keeps working tomorrow
  "openid",
  "profile",
  "email",
  "User.Read", // whose account this is
  "Calendars.ReadWrite", // real free/busy, and writing the invite on Confirm
  "Mail.Send", // sending the ask
  "Mail.ReadWrite", // leaving a draft in Outlook instead of sending
] as const;

/** Scopes a given feature needs, so a partial grant degrades honestly. */
export const SCOPE_FOR = {
  freeBusy: "Calendars.Read",
  createEvent: "Calendars.ReadWrite",
  sendMail: "Mail.Send",
  draftMail: "Mail.ReadWrite",
  readMail: "Mail.Read",
} as const;

/**
 * Whether a granted scope covers what a call needs.
 *
 * Graph returns the scopes it actually granted, and an exact string match gets
 * this wrong in the ordinary case: reading free/busy needs `Calendars.Read`,
 * this app only ever asks for `Calendars.ReadWrite`, and a straight comparison
 * would report a missing permission to someone who had granted everything.
 * ReadWrite is a superset of Read, so it satisfies it.
 */
const IMPLIED_BY: Record<string, readonly string[]> = {
  "calendars.read": ["calendars.readwrite"],
  "mail.read": ["mail.readwrite"],
  "contacts.read": ["contacts.readwrite"],
};

export function scopeSatisfied(granted: readonly string[], required: string): boolean {
  const want = required.toLowerCase();
  const have = granted.map((s) => s.toLowerCase());
  if (have.includes(want)) return true;
  return (IMPLIED_BY[want] ?? []).some((wider) => have.includes(wider));
}

export interface MicrosoftConfig {
  clientId: string;
  clientSecret: string;
  /** A specific tenant, or `organizations` for any work/school account. */
  tenant: string;
  encryptionKey: string;
}

/**
 * The credentials, or null when the app registration doesn't exist yet.
 *
 * Null is the normal state today and every caller treats it as "not
 * connected" rather than an error.
 */
export function getMicrosoftConfig(): MicrosoftConfig | null {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  const encryptionKey = process.env.MICROSOFT_TOKEN_ENCRYPTION_KEY;

  // All three or nothing. A client id without a key would mean writing refresh
  // tokens in the clear, which is worse than staying switched off.
  if (!clientId || !clientSecret || !encryptionKey) return null;

  return {
    clientId,
    clientSecret,
    tenant: process.env.MICROSOFT_TENANT_ID || "organizations",
    encryptionKey,
  };
}

/** Says which piece is missing, for the Settings screen. */
export function describeMissingConfig(): string | null {
  const missing = [
    !process.env.MICROSOFT_CLIENT_ID && "MICROSOFT_CLIENT_ID",
    !process.env.MICROSOFT_CLIENT_SECRET && "MICROSOFT_CLIENT_SECRET",
    !process.env.MICROSOFT_TOKEN_ENCRYPTION_KEY && "MICROSOFT_TOKEN_ENCRYPTION_KEY",
  ].filter(Boolean) as string[];
  return missing.length === 0 ? null : missing.join(", ");
}

export function authorizeUrl(input: {
  config: MicrosoftConfig;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string {
  const params = new URLSearchParams({
    client_id: input.config.clientId,
    response_type: "code",
    redirect_uri: input.redirectUri,
    response_mode: "query",
    scope: MICROSOFT_SCOPES.join(" "),
    state: input.state,
    code_challenge: input.codeChallenge,
    code_challenge_method: "S256",
    // Force the account picker: connecting the wrong mailbox is a silent,
    // confusing failure, and a work laptop is usually signed into two.
    prompt: "select_account",
  });
  return `https://login.microsoftonline.com/${input.config.tenant}/oauth2/v2.0/authorize?${params}`;
}

export function tokenUrl(config: MicrosoftConfig): string {
  return `https://login.microsoftonline.com/${config.tenant}/oauth2/v2.0/token`;
}

/** The redirect URI, which must match the Entra registration exactly. */
export function redirectUriFor(origin: string): string {
  return `${origin}/api/microsoft/callback`;
}

export const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
