/**
 * Outbound email abstraction for the daily digest and reminder emails
 * (spec §19, §31). This is NOT partner-facing email — partner email always goes
 * through Outlook drafts the user sends personally.
 */

export interface OutboundEmail {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface EmailProvider {
  readonly name: string;
  readonly enabled: boolean;
  send(email: OutboundEmail): Promise<{ id: string }>;
}

class ResendProvider implements EmailProvider {
  readonly name = "resend";
  readonly enabled = true;

  constructor(private apiKey: string, private from: string) {}

  async send(email: OutboundEmail): Promise<{ id: string }> {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        from: this.from,
        to: [email.to],
        subject: email.subject,
        html: email.html,
        text: email.text,
      }),
    });
    if (!res.ok) {
      throw new Error(`Email send failed (${res.status}): ${await res.text()}`);
    }
    const data = (await res.json()) as { id: string };
    return { id: data.id };
  }
}

class NoopProvider implements EmailProvider {
  readonly name = "disabled";
  readonly enabled = false;

  async send(): Promise<{ id: string }> {
    throw new Error("Outbound email is not enabled. Add RESEND_API_KEY to turn it on.");
  }
}

export function getEmailProvider(): EmailProvider {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "North <notifications@example.com>";
  return key ? new ResendProvider(key, from) : new NoopProvider();
}
