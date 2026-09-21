"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ListPlus, Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { listNameProblem, listsContaining, type LenderList } from "@/lib/lists";
import { cn } from "@/lib/utils";
import { createListWithLender, setListMembership } from "@/app/(app)/lists/actions";

/**
 * The lists this lender is on, and a way to change that without leaving.
 *
 * Reads as tagging even though it is membership underneath: the lists already
 * on them are chips with an × , and everything else sits behind one button, so
 * the common case — glancing at who this person is grouped with — costs no
 * screen space at all.
 */
export function ListPicker({
  lenderId,
  lists,
}: {
  lenderId: string;
  lists: LenderList[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const on = listsContaining(lists, lenderId);
  const onIds = new Set(on.map((l) => l.id));

  function toggle(listId: string, next: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await setListMembership(listId, lenderId, next);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  function addNew() {
    const problem = listNameProblem(newName, lists);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await createListWithLender(newName, lenderId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setNewName("");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {on.map((list) => (
        <span
          key={list.id}
          className="inline-flex items-center gap-1 rounded-full border border-teal-border bg-teal-soft py-0.5 pl-2.5 pr-1 text-[12px] font-medium text-[#1f6b60]"
        >
          {list.name}
          <button
            type="button"
            onClick={() => toggle(list.id, false)}
            disabled={pending}
            aria-label={`Take off ${list.name}`}
            className="rounded-full p-0.5 hover:bg-white/60 disabled:opacity-50"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={pending}
        aria-expanded={open}
        className={cn(
          "inline-flex items-center gap-1 rounded-full border border-dashed px-2.5 py-0.5 text-[12px] font-medium transition-colors",
          open
            ? "border-primary text-primary"
            : "border-border text-muted hover:border-primary/50 hover:text-foreground",
        )}
      >
        <ListPlus className="h-3 w-3" />
        {on.length === 0 ? "Add to a list" : "Lists"}
      </button>

      {open && (
        <div className="mt-2 w-full rounded-xl border border-border bg-surface p-3">
          {lists.length > 0 && (
            <ul className="mb-2 space-y-1">
              {lists.map((list) => (
                <li key={list.id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1 text-[13px] hover:bg-[#f6f8fb]">
                    <input
                      type="checkbox"
                      checked={onIds.has(list.id)}
                      onChange={(e) => toggle(list.id, e.target.checked)}
                      disabled={pending}
                      className="h-4 w-4 accent-[color:var(--color-primary)]"
                    />
                    <span className="min-w-0 flex-1 truncate">{list.name}</span>
                    <span className="shrink-0 text-[12px] text-muted">
                      {list.memberIds.length}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-center gap-1.5">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addNew();
                }
              }}
              placeholder="New list, e.g. Guys I golf with"
              aria-label="New list name"
              className="h-8 text-[13px]"
            />
            <button
              type="button"
              onClick={addNew}
              disabled={pending || newName.trim() === ""}
              className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 text-[12.5px] font-medium hover:border-primary hover:text-primary disabled:opacity-40"
            >
              <Plus className="h-3.5 w-3.5" /> Add
            </button>
          </div>

          {error && <p className="mt-2 text-[12.5px] text-danger">{error}</p>}
        </div>
      )}

      {error && !open && <p className="w-full text-[12.5px] text-danger">{error}</p>}
    </div>
  );
}
