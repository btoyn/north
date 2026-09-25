/** Tiny trigram-based fuzzy matcher for typo-tolerant partner search (§12).
 *  Fine at this scale (~120 partners); Postgres pg_trgm takes over if lists grow. */

function trigrams(s: string): Set<string> {
  const padded = `  ${s.toLowerCase().trim()} `;
  const grams = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) {
    grams.add(padded.slice(i, i + 3));
  }
  return grams;
}

export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const ta = trigrams(a);
  const tb = trigrams(b);
  let shared = 0;
  for (const g of ta) if (tb.has(g)) shared++;
  const union = ta.size + tb.size - shared;
  return union === 0 ? 0 : shared / union;
}

export interface Searchable {
  /** Fields in priority order: partner name, institution, email (§12). */
  name: string;
  institution?: string | null;
  email?: string | null;
}

export function matchScore(query: string, item: Searchable): number {
  const q = query.toLowerCase().trim();
  if (!q) return 0;

  const name = item.name.toLowerCase();
  const inst = item.institution?.toLowerCase() ?? "";
  const email = item.email?.toLowerCase() ?? "";

  // Exact-ish substring hits rank highest, honoring field priority.
  if (name.startsWith(q)) return 100;
  if (name.includes(q)) return 90;
  if (inst.startsWith(q)) return 80;
  if (inst.includes(q)) return 70;
  if (email.includes(q)) return 60;

  // Fuzzy fallback for typos.
  const s = Math.max(
    similarity(q, name),
    similarity(q, inst) * 0.9,
    similarity(q, email) * 0.8,
  );
  return s >= 0.18 ? s * 50 : 0;
}
