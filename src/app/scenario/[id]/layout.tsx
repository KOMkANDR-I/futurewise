"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { Activity, Bot, CalendarDays, FileQuestion, FileText, Flag, GitBranch, Grid3x3, Lightbulb, Pencil, Scale, ShieldAlert, Target } from "lucide-react";
import { Tour, tourSeen, WORKSPACE_TOUR } from "@/components/tour";
import { KIND_META, runCrashTest, type ModelInput } from "@/lib/engine";
import { updateScenario, useHydrated, useScenario } from "@/lib/store";
import { WorkspaceContext } from "@/components/workspace/context";
import { ParamsPanel } from "@/components/workspace/params-panel";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, Spinner } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { pluralMonths } from "@/lib/format";

const TABS = [
  { href: "", label: "Итог", icon: Activity },
  { href: "/breakpoints", label: "Точка перелома", icon: Target },
  { href: "/sensitivity", label: "Что влияет", icon: Grid3x3 },
  { href: "/goals", label: "Цели", icon: Flag },
  { href: "/calendar", label: "Календарь", icon: CalendarDays },
  { href: "/tree", label: "Дерево «что, если»", icon: GitBranch },
  { href: "/compare", label: "Другие варианты", icon: Scale },
  { href: "/assistant", label: "Помощник", icon: Bot },
  { href: "/report", label: "Отчёт", icon: FileText },
];

export default function ScenarioLayout({ children }: { children: React.ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const path = usePathname();
  const hydrated = useHydrated();
  const scenario = useScenario(id);
  const setModel = useCallback((m: ModelInput) => updateScenario(id, { model: m }), [id]);
  const result = useMemo(() => (scenario ? runCrashTest(scenario.model) : null), [scenario]);
  const [tourOpen, setTourOpen] = useState(false);
  const onResults = path === `/scenario/${id}`;
  // Экскурсия запускается один раз — при первом открытии итогов.
  useEffect(() => {
    if (!hydrated || !scenario || !onResults || tourSeen()) return;
    const t = setTimeout(() => setTourOpen(true), 900);
    return () => clearTimeout(t);
  }, [hydrated, scenario, onResults]);

  if (!hydrated)
    return (
      <div className="container grid place-items-center gap-3 py-24 text-muted">
        <Spinner />
        <span className="text-sm">Загружаем сценарий…</span>
      </div>
    );
  if (!scenario || !result)
    return (
      <div className="container py-16">
        <EmptyState
          icon={<FileQuestion />}
          title="Сценарий не найден"
          text="Он мог быть удалён или создан в другом браузере."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild>
                <Link href="/new">Создать сценарий</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href="/scenarios">Мои сценарии</Link>
              </Button>
            </div>
          }
        />
      </div>
    );

  const base = `/scenario/${id}`;
  const v = result.validation;

  return (
    <WorkspaceContext.Provider value={{ scenario, model: scenario.model, setModel, result }}>
      <div className="container py-8">
        <div className="flex flex-wrap items-start gap-4 print:hidden">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="accent">{KIND_META[scenario.model.kind].label}</Badge>
              {scenario.demo && <Badge tone="violet">демо</Badge>}
              <Badge>расчёт на {pluralMonths(scenario.model.horizon)}</Badge>
            </div>
            <h1 className="mt-2 break-words font-display text-2xl font-extrabold tracking-tight sm:text-3xl">{scenario.title}</h1>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setTourOpen(true)}>
              <Lightbulb /> Подсказки
            </Button>
            <Button asChild variant="secondary" size="sm">
              <Link href={`/new?edit=${id}`}>
                <Pencil /> Редактировать
              </Link>
            </Button>
          </div>
        </div>

        <nav className="no-scrollbar -mx-4 mt-6 overflow-x-auto px-4 print:hidden" aria-label="Разделы сценария" data-tour="tabs">
          <ul className="flex min-w-max gap-1 border-b">
            {TABS.map((t) => {
              const href = base + t.href;
              const active = t.href === "" ? path === base : path?.startsWith(href);
              return (
                <li key={t.href}>
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "-mb-px flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium transition",
                      active ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg",
                    )}
                  >
                    <t.icon className="size-4" /> {t.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] print:mt-0 print:block">
          <div className="order-2 min-w-0 lg:order-1">
            {v.ok ? (
              <div key={path} className="animate-fade-up">
                {children}
              </div>
            ) : (
              <div role="alert" className="card border-bad/40 p-6">
                <div className="flex items-center gap-2 font-semibold text-bad">
                  <ShieldAlert className="size-5" /> Не можем посчитать — проверьте данные
                </div>
                <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
                  {v.errors.map((e) => (
                    <li key={e.path + e.message}>{e.message}</li>
                  ))}
                </ul>
                <Button asChild className="mt-4" size="sm">
                  <Link href={`/new?edit=${id}`}>Исправить в редакторе</Link>
                </Button>
              </div>
            )}
          </div>
          <aside data-tour="params" className="order-1 print:hidden lg:order-2 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto">
            <ParamsPanel />
          </aside>
        </div>
      </div>
      <Tour steps={WORKSPACE_TOUR} open={tourOpen} onClose={() => setTourOpen(false)} />
    </WorkspaceContext.Provider>
  );
}
