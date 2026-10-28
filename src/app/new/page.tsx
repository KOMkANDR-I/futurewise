"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FileQuestion } from "lucide-react";
import { ScenarioForm } from "@/components/scenario-form";
import { defaultModel, KIND_META, type ScenarioKind } from "@/lib/engine";
import { useHydrated, useScenario } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { EmptyState, Spinner } from "@/components/ui/primitives";

function NewScenario() {
  const params = useSearchParams();
  const editId = params.get("edit") ?? undefined;
  const kindParam = params.get("kind") as ScenarioKind | null;
  const hydrated = useHydrated();
  const existing = useScenario(editId ?? "");

  if (editId) {
    if (!hydrated)
      return (
        <div className="container grid place-items-center py-24 text-muted">
          <Spinner />
        </div>
      );
    if (!existing)
      return (
        <div className="container py-16">
          <EmptyState
            icon={<FileQuestion />}
            title="Сценарий не найден"
            text="Возможно, он был удалён или сохранён в другом браузере."
            action={
              <Button asChild>
                <Link href="/new">Создать новый</Link>
              </Button>
            }
          />
        </div>
      );
    return <ScenarioForm key={editId} editId={editId} initial={{ title: existing.title, model: existing.model }} />;
  }
  const kind = kindParam && kindParam in KIND_META ? kindParam : "purchase";
  return <ScenarioForm initial={{ title: "", model: defaultModel(kind) }} />;
}

export default function NewPage() {
  return (
    <Suspense fallback={<div className="container py-24 text-center text-muted">Загрузка…</div>}>
      <NewScenario />
    </Suspense>
  );
}
