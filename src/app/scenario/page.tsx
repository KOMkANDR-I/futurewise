"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, Info, ListChecks } from "lucide-react";
import { MODE_META, resolveSettings, STATUS_META, type Mode } from "@/lib/engine";
import { ProbabilityCard } from "@/components/probability-card";
import { LoanCard, MoneyFlowCard, PdnCard, RangeCard } from "@/components/insight-cards";
import { buildAnalysis } from "@/lib/explain/context";
import { explainLocally } from "@/lib/explain/local";
import { useWorkspace } from "@/components/workspace/context";
import { BalanceChart, SERIES_COLORS } from "@/components/balance-chart";
import { Badge, Card, Segmented, statusTone } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { formatRub, fromMonth, inMonth, pluralMonths } from "@/lib/format";
import { cn, scenarioHref } from "@/lib/utils";

const MODES: Mode[] = ["base", "adverse", "stress"];

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: React.ReactNode; tone?: "good" | "warn" | "bad" }) {
  return (
    <Card className="p-4">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className={cn("num mt-1 font-display text-xl font-bold sm:text-2xl", tone === "bad" && "text-bad", tone === "warn" && "text-warn", tone === "good" && "text-good")}>{value}</div>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </Card>
  );
}

export default function ResultsPage() {
  const { model, result, scenario } = useWorkspace();
  const [tableMode, setTableMode] = useState<Mode>("stress");
  const analysis = useMemo(() => buildAnalysis(model, result), [model, result]);
  const ex = useMemo(() => explainLocally(analysis), [analysis]);
  const m = (k: Mode) => result.modes[k].metrics;
  const reserve = model.finances.minReserve;
  const firstDeficit = MODES.map((k) => ({ k, mo: m(k).firstDeficitMonth })).filter((x) => x.mo != null).sort((a, b) => a.mo! - b.mo!)[0];
  const worst = MODES.reduce((a, b) => (m(b).minBalance < m(a).minBalance ? b : a));
  const f = model.finances;
  const net = f.income + f.extraIncome - f.fixedExpenses - f.variableExpenses - f.existingPayments;
  const noEvents = !model.events.some((e) => e.enabled);
  const daily = resolveSettings(model.settings).cashTiming === "payday";
  const [chartKey, setChartKey] = useState<"end" | "lowPoint">("lowPoint");

  const cushionMonth = (k: Mode) => result.modes[k].rows.find((r) => r.end >= model.decision.cushionTarget)?.month ?? null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-3" data-tour="kpis">
        <Kpi label="Сейчас накоплено" value={formatRub(f.savings)} sub={<>+{formatRub(net)} в месяц</>} />
        <Kpi label={`Будет через ${pluralMonths(model.horizon)}`} value={formatRub(m("base").endBalance)} sub={<>{formatRub(m("adverse").endBalance)} · {formatRub(m("stress").endBalance)}</>} />
        <Kpi
          label="Меньше всего денег будет"
          value={formatRub(m(worst).minBalance)}
          tone={m(worst).status === "deficit" ? "bad" : m(worst).status === "reserve" ? "warn" : "good"}
          sub={<>{inMonth(m(worst).minMonth)}, {MODE_META[worst].phrase}</>}
        />
        <Kpi label="Ваш запас" value={formatRub(reserve)} sub={m(worst).reserveShortfall > 0 ? <>−{formatRub(m(worst).reserveShortfall)}</> : "цел"} />
        <Kpi
          label="Когда может не хватить денег"
          value={firstDeficit ? `${firstDeficit.mo}-й месяц` : "денег хватает"}
          tone={firstDeficit ? "bad" : "good"}
          sub={firstDeficit ? MODE_META[firstDeficit.k].phrase : undefined}
        />
        {model.kind === "cushion" ? (
          <Kpi
            label={`Подушку ${formatRub(model.decision.cushionTarget)} накопите`}
            value={cushionMonth("base") ? `в ${cushionMonth("base")}-м месяце` : "не успеете"}
            sub={<>в кризис — {cushionMonth("stress") ? `в ${cushionMonth("stress")}-м месяце` : "не успеете за срок расчёта"}</>}
          />
        ) : (
          <Kpi label="Решение обойдётся в" value={formatRub(result.plan.totalCost)} sub={result.plan.overpayment > 0 ? <>из них переплата {formatRub(result.plan.overpayment)}</> : result.plan.monthlyPayment ? <>платёж {formatRub(result.plan.monthlyPayment)} в месяц</> : "без переплаты"} />
        )}
      </div>

      <Card className="p-5">
        <div className="flex items-start gap-3">
          {m("stress").status === "ok" ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-good" /> : <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warn" />}
          <div className="space-y-2 text-sm">
            <p className="font-semibold text-fg">{ex.summary}</p>
            <p className="text-muted">{ex.mainRisk}</p>
          </div>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        {MODES.map((k) => {
          const x = m(k);
          return (
            <Card key={k} className="p-4">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <span className="size-2.5 rounded-full" style={{ background: SERIES_COLORS[k] }} />
                  {MODE_META[k].label}
                </span>
                <Badge tone={statusTone(x.status)}>{STATUS_META[x.status].label}</Badge>
              </div>
              <dl className="mt-3 space-y-1 text-xs">
                <div className="flex justify-between">
                  <dt className="text-muted">Меньше всего</dt>
                  <dd className="num font-semibold">
                    {formatRub(x.minBalance)} · {x.minMonth}-й мес.
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">Запас тронут</dt>
                  <dd className="num">{x.firstReserveBreachMonth ? `${fromMonth(x.firstReserveBreachMonth)}, ${pluralMonths(x.reserveBreachMonths)}` : "нет"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">Денег не хватит</dt>
                  <dd className="num">{x.firstDeficitMonth ? `${fromMonth(x.firstDeficitMonth)}, ${pluralMonths(x.deficitMonths)}` : "нет"}</dd>
                </div>
              </dl>
            </Card>
          );
        })}
      </div>

      <Card className="p-5" data-tour="chart">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-bold">Сколько денег будет по месяцам</h2>
          <div className="flex flex-wrap items-center gap-2">
            {noEvents && <Badge tone="warn">Нет событий</Badge>}
            {daily && (
              <Segmented
                size="sm"
                label="Что показывать на графике"
                value={chartKey}
                onChange={setChartKey}
                options={[
                  { value: "lowPoint", label: "Перед зарплатой" },
                  { value: "end", label: "В конце месяца" },
                ]}
              />
            )}
          </div>
        </div>
        <BalanceChart
          reserve={reserve}
          valueKey={daily ? chartKey : "end"}
          series={MODES.map((k) => ({ key: k, label: MODE_META[k].label, color: SERIES_COLORS[k], rows: result.modes[k].rows, startBalance: f.savings, dashed: k !== "base" }))}
        />
      </Card>

      <RangeCard model={model} />

      <ProbabilityCard prob={analysis.probabilistic} reserve={reserve} baseBroken={m("base").status !== "ok"} />

      <div className="grid gap-6 2xl:grid-cols-2">
        <PdnCard model={model} result={result} />
        <LoanCard result={result} />
      </div>

      <MoneyFlowCard model={model} result={result} />

      <div>
        <Card className="p-5">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold">
            <ListChecks className="size-4 text-accent" /> Что мы учли
          </h2>
          <ul className="mt-3 space-y-1.5 text-sm">
            {result.plan.considered.map((c) => (
              <li key={c} className="flex gap-2">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-good" /> {c}
              </li>
            ))}
            {result.plan.unknown.map((c) => (
              <li key={c} className="flex gap-2 text-muted">
                <Info className="mt-0.5 size-4 shrink-0" /> {c}
              </li>
            ))}
            {[...result.plan.warnings, ...result.validation.warnings].map((c) => (
              <li key={c} className="flex gap-2 text-warn">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {c}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg font-bold">Расчёт по месяцам</h2>
          <Segmented label="Сценарий в таблице" size="sm" value={tableMode} onChange={setTableMode} options={MODES.map((k) => ({ value: k, label: MODE_META[k].label }))} />
        </div>
        <div className="-mx-5 mt-4 overflow-x-auto px-5">
          <table className="num w-full min-w-[720px] text-right text-sm">
            <caption className="sr-only">Расчёт по месяцам, сценарий «{MODE_META[tableMode].label}»</caption>
            <thead className="text-xs text-muted">
              <tr className="border-b">
                <th className="py-2 text-left font-medium">Месяц</th>
                <th className="py-2 font-medium">Было</th>
                <th className="py-2 font-medium">Пришло</th>
                <th className="py-2 font-medium">Расходы</th>
                <th className="py-2 font-medium">Кредиты</th>
                <th className="py-2 font-medium">На решение</th>
                <th className="py-2 font-medium">Неприятности</th>
                <th className="py-2 font-medium">Осталось</th>
              </tr>
            </thead>
            <tbody>
              {result.modes[tableMode].rows.map((r) => (
                <tr key={r.month} className={cn("border-b border-border/50", r.belowZero ? "bg-bad/5" : r.belowReserve && "bg-warn/5")}>
                  <td className="py-2 text-left text-muted">{r.month}</td>
                  <td className="py-2">{formatRub(r.start)}</td>
                  <td className="py-2 text-good">+{formatRub(r.income + r.extraIncome + r.decisionIn)}</td>
                  <td className="py-2">−{formatRub(r.expenses)}</td>
                  <td className="py-2">{r.payments ? `−${formatRub(r.payments)}` : "—"}</td>
                  <td className="py-2">{r.decisionOut ? `−${formatRub(r.decisionOut)}` : "—"}</td>
                  <td className={cn("py-2", (r.eventCosts || r.incomeLost) && "text-warn")}>
                    {r.eventCosts ? `−${formatRub(r.eventCosts)}` : r.incomeLost ? `недополучено ${formatRub(r.incomeLost)}` : "—"}
                  </td>
                  <td className={cn("py-2 font-semibold", r.belowZero ? "text-bad" : r.belowReserve ? "text-warn" : "text-fg")}>
                    {formatRub(r.end)}
                    {daily && r.lowPoint < r.end - 0.5 && <div className="text-[11px] font-normal">до зарплаты {formatRub(r.lowPoint)}</div>}
                    {r.interest > 0 && <div className="text-[11px] font-normal text-good">из них проценты {formatRub(r.interest)}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <details className="card p-5">
        <summary className="cursor-pointer font-display text-lg font-bold">Что мы упростили</summary>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-muted">
          {result.assumptions.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </details>

      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link href={scenarioHref(scenario.id, "/breakpoints")}>
            Найти свой предел <ArrowRight />
          </Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href={scenarioHref(scenario.id, "/compare")}>Сравнить другие варианты</Link>
        </Button>
      </div>
    </div>
  );
}
