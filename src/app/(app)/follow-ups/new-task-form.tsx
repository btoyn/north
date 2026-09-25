"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { createTask } from "../activity-actions";

export function NewTaskForm({ lenders }: { lenders: { id: string; name: string }[] }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setError(null);
        startTransition(async () => {
          const result = await createTask({
            title: String(f.get("title") ?? ""),
            lenderId: String(f.get("lenderId") ?? "") || undefined,
            dueAt: String(f.get("dueAt") ?? "") || undefined,
          });
          if (result.error) {
            setError(result.error);
            return;
          }
          formRef.current?.reset();
          router.refresh();
        });
      }}
      className="flex flex-wrap items-end gap-2"
    >
      <div className="min-w-48 flex-1">
        <Input name="title" placeholder="Add a task…" required />
      </div>
      <Select name="lenderId" className="w-44" defaultValue="">
        <option value="">No partner</option>
        {lenders.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </Select>
      <Input name="dueAt" type="date" className="w-40" />
      <Button type="submit" size="md" disabled={pending}>
        <Plus className="h-4 w-4" /> Add
      </Button>
      {error && <p className="w-full text-sm text-danger">{error}</p>}
    </form>
  );
}
