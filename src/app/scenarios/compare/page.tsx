"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Columns3 } from "lucide-react";
import { KIND_META, MODE_META, pdnLevel, PDN_META, runCrashTest, STATUS_META, type Mode } from "@/lib/engine";
import { useHydrated, useScenarios } from "@/lib/store";
import { BalanceChart, PALETTE } from "@/components/balance-chart";
import { Button } from "@/components/ui/button";
import { Badge, Card, EmptyState, Segmented, Spinner, statusTone } from "@/components/ui/primitives";
import { formatPct, formatRub, pluralMonths } from "@/lib/format";
import { cn, scenarioHref } from "@/lib/utils";

const MODES: Mode[] = ["base", "adverse", "stress"];

function CompareScenarios() {
  const params = useSearchParams();
  const ids = (params.get("ids") ?? "").split(",").filter(Boolean);
  const hydrated = useHydrated();
  const all = useScenarios();
  const [mode, setMode] = useState<Mode>("stress");
  const picked = useMemo(() => ids.map((id) => all.find((s) => s.id === id)).filter((s): s is NonNullable<typeof s> => !!s), [ids, all]);
  const results = useMemo(() => picked.map((s) => ({ s, r: runCrashTest(s.model) })), [picked]);

  if (!hydrated)
    return (
      <div className="grid place-items-center py-24 text-muted">
        <Spinner />
      </div>
    );
  if (results.length < 2)
    return (
      <EmptyState
        icon={<Columns3 />}
        title="Выберите хотя бы два сценария"
        text="Отметьте сценарии галочками в списке «Мои сценарии» и нажмите «Сравнить»."
        action={
          <Button asChild>
            <Link href="/scenarios">К списку сценариев</Link>
          </Button>
        }
      />
    );

  const rows: { label: string; get: (x: (typeof results)[number]) => React.ReactNode }[] = [
    { label: "Что это", get: ({ s }) => KIND_META[s.model.kind].label },
    { label: "Срок расчёта", get: ({ s }) => pluralMonths(s.model.horizon) },
    { label: "Решение обойдётся в", get: ({ r }) => formatRub(r.plan.totalCost) },
    { label: "Переплата", get: ({ r }) => (r.plan.overpayment > 0 ? formatRub(r.plan.overpayment) : "—") },
    { label: "Платёж в месяц", get: ({ r }) => (r.plan.monthlyPayment ? formatRub(r.plan.monthlyPayment) : "—") },
    ...MODES.map((k) => ({
      label: `Меньше всего денег: ${MODE_META[k].label.toLowerCase()}`,
      get: ({ r, s }: (typeof results)[number]) => {
        const x = r.modes[k].metrics;
        return <span className={cn("font-semibold", x.minBalance < 0 ? "text-bad" : x.minBalance < s.model.finances.minReserve ? "text-warn" : "")}>{formatRub(x.minBalance)}</span>;
      },
    })),
    ...MODES.map((k) => ({
      label: `Итог: ${MODE_META[k].label.toLowerCase()}`,
      get: ({ r }: (typeof results)[number]) => <Badge tone={statusTone(r.modes[k].metrics.status)}>{STATUS_META[r.modes[k].metrics.status].label}</Badge>,
    })),
    {
      label: "Долговая нагрузка (кризис)",
      get: ({ r }) => {
        const p = r.modes.stress.metrics.pdnMax;
        return p == null ? "нет дохода" : `${formatPct(Math.round(p * 1000) / 10)} · ${PDN_META[pdnLevel(p)].label.toLowerCase()}`;
      },
    },
    { label: "В конце расчёта (обычный)", get: ({ r }) => formatRub(r.modes.base.metrics.endBalance) },
  ];

  return (
    <div className="space-y-6">
      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="num w-full text-sm" style={{ minWidth: 240 + results.length * 180 }}>
            <caption className="sr-only">Сравнение сценариев</caption>
            <thead>
              <tr className="border-b">
                <th className="p-3 text-left text-xs font-medium text-muted">Показатель</th>
                {results.map(({ s }, i) => (
                  <th key={s.id} className="p-3 text-left">
                    <span className="flex items-center gap-2">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />
                      <Link href={scenarioHref(s.id)} className="font-display font-bold hover:text-accent">
                        {s.title}
                      </Link>
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} className="border-b border-border/50">
                  <td className="p-3 text-xs text-muted">{row.label}</td>
                  {results.map((x) => (
                    <td key={x.s.id} className="p-3">
                      {row.get(x)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg font-bold">Сколько денег будет по месяцам</h2>
          <Segmented label="Сценарий" size="sm" value={mode} onChange={setMode} options={MODES.map((k) => ({ value: k, label: MODE_META[k].label }))} />
        </div>
        <BalanceChart
          key={mode}
          reserve={Math.min(...results.map(({ s }) => s.model.finances.minReserve))}
          series={results.map(({ s, r }, i) => ({ key: s.id, label: s.title, color: PALETTE[i % PALETTE.length], rows: r.modes[mode].rows, startBalance: s.model.finances.savings, dashed: i > 0 }))}
          caption={results.some(({ s }) => s.model.finances.minReserve !== results[0].s.model.finances.minReserve) ? "У сценариев разный запас — на графике показан наименьший." : undefined}
        />
      </Card>
    </div>
  );
}

export default function CompareScenariosPage() {
  return (
    <div className="container max-w-6xl py-10">
      <Button asChild variant="ghost" size="sm">
        <Link href="/scenarios">
          <ArrowLeft /> Мои сценарии
        </Link>
      </Button>
      <h1 className="mt-3 font-display text-3xl font-extrabold tracking-tight">Сравнение сценариев</h1>
      <div className="mt-6">
        <Suspense fallback={<div className="py-24 text-center text-muted">Загрузка…</div>}>
          <CompareScenarios />
        </Suspense>
      </div>
    </div>
  );
}
