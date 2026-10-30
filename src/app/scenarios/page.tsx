"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Columns3, Copy, Download, FolderOpen, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { KIND_META, parseScenarios, runCrashTest, serializeScenarios, STATUS_META } from "@/lib/engine";
import { createScenario, deleteScenario, duplicateScenario, getStorageError, useHydrated, useScenarios, type SavedScenario } from "@/lib/store";
import { downloadText, safeFileName } from "@/lib/download";
import { cn, scenarioHref } from "@/lib/utils";
import { pluralMonths } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge, Card, Dialog, EmptyState, Spinner, statusTone } from "@/components/ui/primitives";
import { formatRub } from "@/lib/format";

function ScenarioRow({ s, onDelete, checked, onCheck }: { s: SavedScenario; onDelete: () => void; checked: boolean; onCheck: (v: boolean) => void }) {
  const res = useMemo(() => {
    try {
      return runCrashTest(s.model);
    } catch {
      return null;
    }
  }, [s.model]);
  const stress = res?.modes.stress.metrics;
  return (
    <Card className={cn("flex flex-col gap-4 p-5 sm:flex-row sm:items-center", checked && "ring-1 ring-accent")}>
      <input type="checkbox" checked={checked} onChange={(e) => onCheck(e.target.checked)} aria-label={`Выбрать «${s.title}» для сравнения`} className="size-4 shrink-0 accent-[rgb(var(--accent))]" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={scenarioHref(s.id)} className="truncate font-display text-lg font-bold hover:text-accent">
            {s.title}
          </Link>
          {s.demo && <Badge tone="violet">демо</Badge>}
        </div>
        <p className="mt-1 text-sm text-muted">
          {KIND_META[s.model.kind].label} · на {pluralMonths(s.model.horizon)} · изменён {new Date(s.updatedAt).toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short" })}
        </p>
      </div>
      {stress && (
        <div className="text-sm sm:text-right">
          <div className="text-muted">В кризисном сценарии</div>
          <div className="flex items-center gap-2 sm:justify-end">
            <span className="num font-semibold">{formatRub(stress.minBalance)}</span>
            <Badge tone={statusTone(stress.status)}>{STATUS_META[stress.status].label}</Badge>
          </div>
        </div>
      )}
      <div className="flex gap-1">
        <Button asChild variant="secondary" size="sm">
          <Link href={scenarioHref(s.id)}>
            <FolderOpen /> Открыть
          </Link>
        </Button>
        <Button asChild variant="ghost" size="icon">
          <Link href={`/new?edit=${s.id}`} aria-label={`Редактировать «${s.title}»`}>
            <Pencil />
          </Link>
        </Button>
        <Button variant="ghost" size="icon" onClick={() => duplicateScenario(s.id)} aria-label={`Дублировать «${s.title}»`}>
          <Copy />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => downloadText(`${safeFileName(s.title)}.futurewise.json`, serializeScenarios([{ title: s.title, model: s.model }]))} aria-label={`Экспортировать «${s.title}» в файл`}>
          <Download />
        </Button>
        <Button variant="ghost" size="icon" onClick={onDelete} aria-label={`Удалить «${s.title}»`} className="hover:text-bad">
          <Trash2 />
        </Button>
      </div>
    </Card>
  );
}

export default function ScenariosPage() {
  const hydrated = useHydrated();
  const list = useScenarios();
  const [toDelete, setToDelete] = useState<SavedScenario | null>(null);
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const err = getStorageError();

  const onImport = async (file: File | undefined) => {
    if (!file) return;
    const res = parseScenarios(await file.text());
    if (!res.ok) setImportMsg({ ok: false, text: res.error });
    else {
      res.items.forEach((it) => createScenario(it.title, it.model));
      setImportMsg({ ok: true, text: `Импортировано сценариев: ${res.items.length}.` });
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="container max-w-5xl py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">Мои сценарии</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" id="import-file" onChange={(e) => onImport(e.target.files?.[0])} />
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>
            <Upload /> Импорт
          </Button>
          {list.length > 0 && (
            <Button variant="secondary" onClick={() => downloadText(`futurewise-scenarios-${new Date().toISOString().slice(0, 10)}.json`, serializeScenarios(list.map((s) => ({ title: s.title, model: s.model }))))}>
              <Download /> Экспорт всех
            </Button>
          )}
          <Button asChild>
            <Link href="/new">
              <Plus /> Новый сценарий
            </Link>
          </Button>
        </div>
      </div>
      {err && <p className="mt-4 rounded-xl border border-warn/30 bg-warn/10 p-3 text-sm text-warn">{err}</p>}
      {list.length > 1 && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border bg-surface-2/40 p-3 text-sm">
          <span className="text-muted">{selected.length < 2 ? "Отметьте два или больше сценариев, чтобы сравнить их рядом." : `Выбрано: ${selected.length}`}</span>
          <Button asChild size="sm" className={cn(selected.length < 2 && "pointer-events-none opacity-50")} aria-disabled={selected.length < 2}>
            <Link href={`/scenarios/compare?ids=${selected.join(",")}`} tabIndex={selected.length < 2 ? -1 : undefined}>
              <Columns3 /> Сравнить
            </Link>
          </Button>
        </div>
      )}
      {importMsg && (
        <p role="status" className={cn("mt-4 rounded-xl border p-3 text-sm", importMsg.ok ? "border-good/30 bg-good/10 text-good" : "border-bad/30 bg-bad/10 text-bad")}>
          {importMsg.text}
        </p>
      )}
      <div className="mt-8 space-y-3">
        {!hydrated ? (
          <div className="grid place-items-center py-16 text-muted">
            <Spinner />
          </div>
        ) : list.length === 0 ? (
          <EmptyState
            icon={<FolderOpen />}
            title="Пока нет сценариев"
            text="Создайте первый сценарий или откройте демо — это займёт пару минут."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button asChild>
                  <Link href="/new">Создать сценарий</Link>
                </Button>
                <Button asChild variant="secondary">
                  <Link href="/demo">Посмотреть демо</Link>
                </Button>
              </div>
            }
          />
        ) : (
          list.map((s) => (
            <ScenarioRow key={s.id} s={s} onDelete={() => setToDelete(s)} checked={selected.includes(s.id)} onCheck={(v) => setSelected((x) => (v ? [...x, s.id] : x.filter((id) => id !== s.id)))} />
          ))
        )}
      </div>
      <Dialog open={!!toDelete} onOpenChange={(v) => !v && setToDelete(null)} title="Удалить сценарий?" description={toDelete ? `«${toDelete.title}» удалится навсегда.` : undefined}>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setToDelete(null)}>
            Отмена
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (toDelete) deleteScenario(toDelete.id);
              setToDelete(null);
            }}
          >
            <Trash2 /> Удалить
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
