"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";
import { Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, Label } from "@/components/ui/input";
import { normalizeName } from "@/lib/utils";
import { suggestTags, type TagSuggestion } from "@/lib/note-tags";
import { TERRITORIES } from "@/lib/labels";
import { importLenders, type ImportReport, type ImportRow } from "./actions";

type Step = "upload" | "map" | "preview" | "done";

const FIELDS = [
  { key: "fullName", label: "Full name (single column)" },
  { key: "firstName", label: "First name" },
  { key: "lastName", label: "Last name" },
  { key: "email", label: "Email" },
  { key: "institutionName", label: "Institution" },
  { key: "city", label: "City" },
  { key: "territory", label: "Territory" },
  { key: "title", label: "Title" },
  { key: "phone", label: "Phone" },
  { key: "address", label: "Address" },
  { key: "notes", label: "Notes" },
] as const;

type FieldKey = (typeof FIELDS)[number]["key"];

const AUTO_MAP: [RegExp, FieldKey][] = [
  [/^(banker|lender|contact)?\s*(full\s*)?name$/i, "fullName"],
  [/first/i, "firstName"],
  [/last|surname/i, "lastName"],
  [/e-?mail/i, "email"],
  [/institution|bank|company|employer/i, "institutionName"],
  [/city|town/i, "city"],
  [/territory|region|area|market/i, "territory"],
  [/title|position|role/i, "title"],
  [/phone|mobile|cell/i, "phone"],
  [/address|street/i, "address"],
  [/note|comment|remark|misc|interest/i, "notes"],
];

interface ParsedRow {
  cells: Record<string, string>;
}

export function ImportWizard({
  hasSampleData,
  existingKeys,
}: {
  hasSampleData: boolean;
  existingKeys: { names: string[]; emails: string[] };
}) {
  const [step, setStep] = useState<Step>("upload");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [mapping, setMapping] = useState<Record<string, FieldKey | "">>({});
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmSampleRemoval, setConfirmSampleRemoval] = useState(false);
  const [rejectedTags, setRejectedTags] = useState<Set<string>>(new Set());
  const [report, setReport] = useState<ImportReport | null>(null);
  const [pending, startTransition] = useTransition();

  const existingNameSet = useMemo(() => new Set(existingKeys.names), [existingKeys.names]);
  const existingEmailSet = useMemo(() => new Set(existingKeys.emails), [existingKeys.emails]);

  async function handleFile(file: File) {
    setError(null);
    setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      if (json.length === 0) {
        setError("That file looks empty — no rows found on the first sheet.");
        return;
      }
      const hdrs = Object.keys(json[0]);
      setHeaders(hdrs);
      setRows(
        json.map((r) => ({
          cells: Object.fromEntries(hdrs.map((h) => [h, String(r[h] ?? "").trim()])),
        })),
      );
      const auto: Record<string, FieldKey | ""> = {};
      for (const h of hdrs) {
        const hit = AUTO_MAP.find(([re]) => re.test(h));
        auto[h] = hit ? hit[1] : "";
      }
      setMapping(auto);
      setStep("map");
    } catch {
      setError("Couldn't read that file. Make sure it's a .xlsx or .csv export.");
    }
  }

  const mappedRows: (ImportRow & { suggestions: TagSuggestion[]; duplicate: boolean })[] =
    useMemo(() => {
      if (step === "upload") return [];
      const get = (r: ParsedRow, field: FieldKey) => {
        const col = Object.entries(mapping).find(([, f]) => f === field)?.[0];
        return col ? (r.cells[col] ?? "") : "";
      };
      return rows
        .map((r) => {
          let firstName = get(r, "firstName");
          let lastName = get(r, "lastName");
          const fullName = get(r, "fullName");
          if (!firstName && fullName) {
            const parts = fullName.split(/\s+/);
            firstName = parts[0] ?? "";
            lastName = parts.slice(1).join(" ");
          }
          const email = get(r, "email").toLowerCase();
          const notes = get(r, "notes");
          const name = `${firstName} ${lastName}`.trim();
          return {
            firstName,
            lastName,
            email,
            institutionName: get(r, "institutionName"),
            city: get(r, "city"),
            territory: matchTerritory(get(r, "territory"), get(r, "city")),
            title: get(r, "title"),
            phone: get(r, "phone"),
            address: get(r, "address"),
            notes,
            acceptedTags: [],
            suggestions: suggestTags(notes),
            duplicate:
              (email !== "" && existingEmailSet.has(email)) ||
              (name !== "" && existingNameSet.has(normalizeName(name))),
          };
        })
        .filter((r) => r.firstName || r.email);
    }, [step, rows, mapping, existingEmailSet, existingNameSet]);

  function runImport() {
    setError(null);
    startTransition(async () => {
      const payload: ImportRow[] = mappedRows.map((r) => ({
        firstName: r.firstName,
        lastName: r.lastName,
        email: r.email,
        institutionName: r.institutionName,
        city: r.city,
        territory: r.territory,
        title: r.title,
        phone: r.phone,
        address: r.address,
        notes: r.notes,
        acceptedTags: r.suggestions.filter(
          (s) => !rejectedTags.has(`${r.email || r.firstName}:${s.detail}`),
        ),
      }));
      const result = await importLenders(payload, hasSampleData && confirmSampleRemoval);
      if (result.error) {
        setError(result.error);
        return;
      }
      setReport(result);
      setStep("done");
    });
  }

  if (step === "upload") {
    return (
      <Card>
        <CardContent className="pt-5">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border px-6 py-14 text-center transition-colors hover:border-primary/50 hover:bg-primary-soft/30">
            <Upload className="h-8 w-8 text-muted" />
            <div>
              <p className="font-medium">Choose your Excel or CSV file</p>
              <p className="text-sm text-muted">.xlsx or .csv — your current spreadsheet works as-is</p>
            </div>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
          </label>
          {error && <p className="mt-3 text-sm text-danger">{error}</p>}
        </CardContent>
      </Card>
    );
  }

  if (step === "map") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Match your columns</CardTitle>
          <CardDescription>
            {fileName} · {rows.length} rows. We guessed the mapping — adjust anything that&apos;s wrong.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {headers.map((h) => (
            <div key={h} className="grid grid-cols-2 items-center gap-3">
              <div>
                <Label className="mb-0">{h}</Label>
                <p className="truncate text-xs text-muted">
                  e.g. {rows[0]?.cells[h] || "—"}
                </p>
              </div>
              <Select
                value={mapping[h] ?? ""}
                onChange={(e) =>
                  setMapping((m) => ({ ...m, [h]: e.target.value as FieldKey | "" }))
                }
              >
                <option value="">Don&apos;t import</option>
                {FIELDS.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </Select>
            </div>
          ))}
          <div className="flex gap-2 pt-2">
            <Button variant="secondary" onClick={() => setStep("upload")}>
              Back
            </Button>
            <Button
              onClick={() => setStep("preview")}
              disabled={!Object.values(mapping).some((v) => v === "fullName" || v === "firstName")}
            >
              Preview import
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (step === "preview") {
    const duplicates = mappedRows.filter((r) => r.duplicate).length;
    const withSuggestions = mappedRows.filter((r) => r.suggestions.length > 0);
    return (
      <div className="space-y-4">
        {hasSampleData && (
          <Card className="border-warning/40">
            <CardContent className="pt-5">
              <p className="font-medium">Your workspace currently shows sample data</p>
              <p className="mt-1 text-sm text-muted">
                Importing your real list removes every sample record so the two are never mixed.
              </p>
              <label className="mt-3 flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-border"
                  checked={confirmSampleRemoval}
                  onChange={(e) => setConfirmSampleRemoval(e.target.checked)}
                />
                Yes — delete all sample data when I import
              </label>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ready to import {mappedRows.length} lenders</CardTitle>
            <CardDescription>
              {duplicates > 0
                ? `${duplicates} look like existing records — they'll be merged (empty fields filled in, nothing overwritten).`
                : "No duplicates detected."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-80 overflow-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-background text-left text-xs text-muted">
                  <tr>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Institution</th>
                    <th className="px-3 py-2">Email</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {mappedRows.map((r, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2">{`${r.firstName} ${r.lastName}`.trim()}</td>
                      <td className="px-3 py-2">{r.institutionName || "—"}</td>
                      <td className="px-3 py-2">{r.email || "—"}</td>
                      <td className="px-3 py-2">
                        {r.duplicate ? (
                          <Badge variant="warning">Merge</Badge>
                        ) : (
                          <Badge variant="success">New</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {withSuggestions.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Suggested tags from your notes</CardTitle>
              <CardDescription>
                Original notes are always kept word-for-word. Uncheck anything that&apos;s off.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {withSuggestions.map((r) => (
                <div key={r.email || r.firstName} className="text-sm">
                  <p className="font-medium">
                    {`${r.firstName} ${r.lastName}`.trim()}{" "}
                    <span className="font-normal text-muted">— “{r.notes}”</span>
                  </p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {r.suggestions.map((s) => {
                      const key = `${r.email || r.firstName}:${s.detail}`;
                      const rejected = rejectedTags.has(key);
                      return (
                        <label
                          key={key}
                          className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
                            rejected
                              ? "border-border text-muted line-through"
                              : "border-primary/40 bg-primary-soft text-primary"
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="hidden"
                            checked={!rejected}
                            onChange={() =>
                              setRejectedTags((prev) => {
                                const next = new Set(prev);
                                if (next.has(key)) next.delete(key);
                                else next.add(key);
                                return next;
                              })
                            }
                          />
                          {s.detail}
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setStep("map")}>
            Back
          </Button>
          <Button onClick={runImport} disabled={pending || (hasSampleData && !confirmSampleRemoval)}>
            {pending ? "Importing…" : `Import ${mappedRows.length} partners`}
          </Button>
        </div>
        {hasSampleData && !confirmSampleRemoval && (
          <p className="text-xs text-muted">
            Confirm sample-data removal above to enable the import.
          </p>
        )}
      </div>
    );
  }

  // done
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Import complete</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="Added" value={report?.added ?? 0} />
          <Stat label="Merged" value={report?.merged ?? 0} />
          <Stat label="Skipped" value={report?.skipped ?? 0} />
          <Stat label="Needs review" value={report?.needsReview.length ?? 0} />
          <Stat label="Missing email" value={report?.missingEmail ?? 0} />
          <Stat label="Missing territory" value={report?.missingTerritory ?? 0} />
        </div>
        {report && report.needsReview.length > 0 && (
          <div className="rounded-lg bg-warning-soft p-3 text-sm">
            <p className="mb-1 font-medium text-warning">Worth a look:</p>
            <ul className="list-disc pl-5 text-warning">
              {report.needsReview.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </div>
        )}
        <Link href="/tiers" className={buttonVariants({ variant: "primary", size: "md" })}>
          See your lenders
        </Link>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border p-3 text-center">
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}

function matchTerritory(raw: string, city: string): string {
  const t = raw.trim();
  const exact = TERRITORIES.find((x) => x.toLowerCase() === t.toLowerCase());
  if (exact) return exact;
  const c = (city || t).toLowerCase();
  if (/st\.?\s*george|cedar|hurricane|washington|ivins|santa clara/.test(c)) return "Southern Utah";
  if (/ogden|logan|brigham|layton|kaysville|roy|clearfield/.test(c)) return "Northern Utah";
  if (/salt lake|provo|orem|sandy|draper|lehi|murray|jordan|taylorsville|bountiful/.test(c))
    return "Wasatch Front";
  return t;
}
