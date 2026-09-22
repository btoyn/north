/**
 * The details you need in your hand when you are about to ring someone.
 *
 * All of it is already stored; none of it was anywhere you could see without
 * opening the edit form. These functions decide what to show and how to write
 * it, so the card and anything else that wants a phone number agree on what a
 * phone number looks like.
 */

export interface ContactSource {
  address: string | null;
  city: string | null;
  state: string | null;
}

export interface ContactCardInput {
  lender: ContactSource & {
    email: string | null;
    emailBounced?: boolean | null;
    mobilePhone: string | null;
    officePhone: string | null;
  };
  institution:
    | (ContactSource & { id: string; name: string; mainPhone: string | null })
    | null;
}

export interface ContactCardFields {
  bank: { id: string; name: string } | null;
  /** Their own address if it is on file, otherwise the bank's. */
  address: { text: string; source: "lender" | "bank" } | null;
  cell: string | null;
  office: string | null;
  /** The bank's main line, shown only when there is no direct number at all. */
  switchboard: string | null;
  email: string | null;
  emailBounced: boolean;
  /** True when there is nothing at all to show, so the card can say so. */
  empty: boolean;
}

/**
 * One line, in the order an envelope is read, skipping whatever is missing.
 *
 * A record with a city and no street is still worth printing — knowing someone
 * is in St. George is most of what the address is for here.
 */
export function formatAddress(source: ContactSource): string | null {
  const street = source.address?.trim() || null;
  const city = source.city?.trim() || null;
  const state = source.state?.trim() || null;

  const cityState = [city, state].filter(Boolean).join(", ");
  const line = [street, cityState].filter(Boolean).join(", ");
  return line || null;
}

/** Digits only, with the country code a dialler expects. */
export function telHref(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `tel:+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `tel:+${digits}`;
  // Anything else is either international or half-typed; hand it over as it is
  // rather than guessing a country onto it.
  return digits.length >= 7 ? `tel:${digits}` : null;
}

/**
 * A number as it would be written down.
 *
 * Ten and eleven digits are formatted; everything else is returned untouched,
 * because a number this doesn't recognise is more useful shown exactly as it
 * was typed than reformatted into something wrong.
 */
export function formatPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const digits = trimmed.replace(/\D/g, "");
  const ten = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (ten.length !== 10) return trimmed;
  return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
}

/**
 * What the card shows, with the falling back already done.
 *
 * Their own address wins over the bank's, because a lender who works out of a
 * branch two towns from head office is exactly the person you would drive to
 * the wrong building for. The switchboard appears only when there is no direct
 * number, where it is better than nothing and otherwise just noise.
 */
export function contactCardFields(input: ContactCardInput): ContactCardFields {
  const { lender, institution } = input;

  const own = formatAddress(lender);
  const bankAddress = institution ? formatAddress(institution) : null;
  const address: ContactCardFields["address"] = own
    ? { text: own, source: "lender" }
    : bankAddress
      ? { text: bankAddress, source: "bank" }
      : null;

  const cell = formatPhone(lender.mobilePhone);
  const office = formatPhone(lender.officePhone);
  const email = lender.email?.trim() || null;

  return {
    bank: institution ? { id: institution.id, name: institution.name } : null,
    address,
    cell,
    office,
    switchboard: cell || office ? null : formatPhone(institution?.mainPhone),
    email,
    emailBounced: Boolean(lender.emailBounced),
    empty: !address && !cell && !office && !email && !institution,
  };
}
