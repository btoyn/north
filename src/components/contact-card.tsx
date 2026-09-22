"use client";

import { useState } from "react";
import Link from "next/link";
import { Building2, Check, Copy, Mail, MapPin, Phone, Smartphone } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { telHref, type ContactCardFields } from "@/lib/contact-card";
import { cn } from "@/lib/utils";

/**
 * Name, bank, address, phone, email — the things you want in front of you when
 * you are about to call someone.
 *
 * All of it was already stored and none of it was visible without opening the
 * edit form, which is the wrong place to keep a phone number. Numbers and
 * addresses are real links: on a phone the number dials and the address opens
 * maps, which is where this card gets used most.
 */
export function ContactCard({
  name,
  title,
  fields,
}: {
  name: string;
  title: string | null;
  fields: ContactCardFields;
}) {
  const mapsHref = fields.address
    ? `https://maps.google.com/?q=${encodeURIComponent(fields.address.text)}`
    : null;

  return (
    <Card>
      <CardContent className="space-y-3 pt-5">
        <div>
          <p className="text-[15px] font-semibold leading-tight">{name}</p>
          {title && <p className="mt-0.5 text-[13px] text-muted">{title}</p>}
        </div>

        {fields.empty ? (
          <p className="text-[13.5px] text-muted">
            No contact details on file yet. Add them under Details.
          </p>
        ) : (
          <dl className="space-y-2.5 text-[13.5px]">
            {fields.bank && (
              <Row icon={Building2} label="Bank">
                <Link
                  href={`/institutions/${fields.bank.id}`}
                  className="font-medium text-primary hover:underline"
                >
                  {fields.bank.name}
                </Link>
              </Row>
            )}

            {fields.address && mapsHref && (
              <Row icon={MapPin} label="Address">
                <a
                  href={mapsHref}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:underline"
                >
                  {fields.address.text}
                </a>
                {fields.address.source === "bank" && (
                  <span className="ml-1.5 text-[12px] text-muted">(bank)</span>
                )}
              </Row>
            )}

            {fields.cell && <PhoneRow icon={Smartphone} label="Cell" value={fields.cell} />}
            {fields.office && <PhoneRow icon={Phone} label="Office" value={fields.office} />}
            {fields.switchboard && (
              <PhoneRow icon={Phone} label="Bank line" value={fields.switchboard} />
            )}

            {fields.email && (
              <Row icon={Mail} label="Email">
                <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <a href={`mailto:${fields.email}`} className="truncate hover:underline">
                    {fields.email}
                  </a>
                  <CopyButton value={fields.email} what="Email" />
                  {fields.emailBounced && (
                    <span className="rounded-full bg-gold-soft px-1.5 py-0.5 text-[11px] font-semibold text-[#6d5210]">
                      Bounced
                    </span>
                  )}
                </span>
              </Row>
            )}
          </dl>
        )}
      </CardContent>
    </Card>
  );
}

function Row({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Mail;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
      <dt className="sr-only">{label}</dt>
      <dd className="min-w-0 flex-1">{children}</dd>
    </div>
  );
}

function PhoneRow({
  icon,
  label,
  value,
}: {
  icon: typeof Phone;
  label: string;
  value: string;
}) {
  const href = telHref(value);
  return (
    <Row icon={icon} label={label}>
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {href ? (
          <a href={href} className="font-medium hover:underline">
            {value}
          </a>
        ) : (
          <span className="font-medium">{value}</span>
        )}
        <span className="text-[12px] text-muted">{label.toLowerCase()}</span>
        <CopyButton value={value} what={label} />
      </span>
    </Row>
  );
}

/**
 * Copying is what this card is for on a desktop, where a number cannot be
 * tapped and retyping it into a handset is how digits get transposed.
 */
function CopyButton({ value, what }: { value: string; what: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // No clipboard permission. The text is on screen and selectable, which
      // is the fallback everyone already knows.
    }
  }

  return (
    <button
      onClick={copy}
      aria-label={copied ? `${what} copied` : `Copy ${what.toLowerCase()}`}
      className={cn(
        "rounded-md p-1 text-muted transition-colors hover:bg-black/[0.05] hover:text-foreground",
        copied && "text-[#1f6b60]",
      )}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}
