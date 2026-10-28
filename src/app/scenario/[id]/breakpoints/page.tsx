"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Infinity as InfinityIcon, Target, XCircle } from "lucide-react";
import { findBreakpoints, MODE_META, STATUS_META, type Breakpoint, type BreakpointUnit, type Criterion, type Metrics, type Mode } from "@/lib/engine";
import { useWorkspace } from "@/components/workspace/context";
import { Badge, Card, NumberInput, Segmented, statusTone } from "@/components/ui/primitives";
import { formatPct, formatRub, fromMonth, inMonth, pluralMonths } from "@/lib/format";
import { cn } from "@/lib/utils";

function fmt(v: number | null, unit: BreakpointUnit) {
  if (v == null) return "—";
  switch (unit) {
    case "pct":
      return formatPct(v);
    case "rub":
      return formatRub(v);
    case "rub_month":
      return `${formatRub(v)} в месяц`;
    case "month":
      return `${v}-й месяц`;
    case "months":
      return pluralMonths(v);
  }
}

const METHOD_LABEL = { binary: "точный поиск", scan: "перебор вариантов", direct: "прямой расчёт" };

function MetricsBox({ title, m, tone, icon }: { title: string; m: Metrics | null; tone: "good" | "bad"; icon: React.ReactNode }) {
  return (
    <div className={cn("rounded-xl border p-3", tone === "good" ? "border-good/30 bg-good/5" : "border-bad/30 bg-bad/5")}>
      <div className={cn("flex items-center gap-1.5 text-xs font-semibold", tone === "good" ? "text-good" : "text-bad")}>
        {icon} {title}
      </div>
      {m ? (
        <dl className="mt-2 space-y-1 text-xs">
          <div className="flex justify-between gap-2">
            <dt className="text-muted">Меньше всего денег</dt>
            <dd className="num font-semibold">{formatRub(m.minBalance)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted">Запас тронут</dt>
            <dd className="num">{m.firstReserveBreachMonth ? fromMonth(m.firstReserveBreachMonth) : "нет"}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted">Денег не хватит</dt>
            <dd className="num">{m.firstDeficitMonth ? fromMonth(m.firstDeficitMonth) : "нет"}</dd>
          </div>
          <div className="pt-1">
            <Badge tone={statusTone(m.status)}>{STATUS_META[m.status].label}</Badge>
          </div>
        </dl>
      ) : (
        <p className="mt-2 text-xs text-muted">Здесь нечего показать.</p>
      )}
    </div>
  );
}

function BreakpointCard({ b, criterionLabel }: { b: Breakpoint; criterionLabel: string }) {
  const statusLine =
    b.method === "direct"
      ? b.threshold == null
        ? `Всё в порядке: ${criterionLabel} на всём сроке расчёта.`
        : `Впервые это случится ${inMonth(b.threshold)}.`
      : b.status === "found"
        ? b.direction === "max"
          ? `До ${fmt(b.threshold, b.unit)} вы справляетесь. Больше — уже нет.`
          : `От ${fmt(b.threshold, b.unit)} вы справляетесь. Меньше — уже нет.`
        : b.status === "holds_all"
          ? `Вы справляетесь при любом значении от ${fmt(b.range[0], b.unit)} до ${fmt(b.range[1], b.unit)}. Предела здесь нет — и мы его не выдумываем.`
          : "Не получается справиться даже в самом удачном случае — дело не в этом параметре, а в других.";

  const margin = b.current != null && b.threshold != null && b.status === "found" && b.method !== "direct" ? b.threshold - b.current : null;
  const pos = b.current != null && b.threshold != null && b.range[1] > b.range[0] ? Math.min(100, Math.max(0, ((b.current - b.range[0]) / (Math.max(b.threshold * 1.5, b.current * 1.2, 1) - b.range[0])) * 100)) : null;
  const thrPos = b.threshold != null && pos != null ? Math.min(100, ((b.threshold - b.range[0]) / (Math.max(b.threshold * 1.5, (b.current ?? 0) * 1.2, 1) - b.range[0])) * 100) : null;

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-lg font-bold">{b.title}</h3>
          <p className="mt-0.5 text-sm text-muted">{b.question}</p>
        </div>
        <Badge>{METHOD_LABEL[b.method]}</Badge>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-surface-2/60 p-3">
          <div className="text-xs text-muted">Сейчас</div>
          <div className="num mt-1 text-lg font-bold">{b.method === "direct" ? "—" : fmt(b.current, b.unit)}</div>
        </div>
        <div className="rounded-xl bg-accent/10 p-3">
          <div className="text-xs text-accent">Предел</div>
          <div className="num mt-1 flex items-center gap-1.5 text-lg font-bold text-accent">
            {b.status === "holds_all" && b.method !== "direct" ? (
              <>
                <InfinityIcon className="size-4" /> нет предела
              </>
            ) : b.method === "direct" && b.threshold == null ? (
              "не случится"
            ) : (
              fmt(b.threshold, b.unit)
            )}
          </div>
        </div>
        <div className="rounded-xl bg-surface-2/60 p-3">
          <div className="text-xs text-muted">Запас до предела</div>
          <div className={cn("num mt-1 text-lg font-bold", margin != null && (b.direction === "max" ? margin < 0 : margin > 0) ? "text-bad" : "text-fg")}>
            {margin != null ? `${margin > 0 ? "+" : margin < 0 ? "−" : ""}${fmt(Math.abs(margin), b.unit)}` : "—"}
          </div>
        </div>
      </div>

      {pos != null && thrPos != null && b.status === "found" && b.method !== "direct" && (
        <div className="mt-4" aria-hidden>
          <div className="relative h-2 rounded-full bg-surface-2">
            <div className={cn("absolute inset-y-0 rounded-full", b.direction === "max" ? "left-0 bg-good/40" : "right-0 bg-good/40")} style={b.direction === "max" ? { width: `${thrPos}%` } : { left: `${thrPos}%` }} />
            <div className="absolute -top-1 h-4 w-0.5 bg-accent" style={{ left: `${thrPos}%` }} />
            <div className="absolute -top-1.5 size-5 -translate-x-1/2 rounded-full border-2 border-bg bg-fg" style={{ left: `${pos}%` }} />
          </div>
          <div className="mt-1.5 flex justify-between text-[11px] text-muted">
            <span>● сейчас</span>
            <span className="text-accent">| предел</span>
          </div>
        </div>
      )}

      <p className="mt-4 text-sm">{statusLine}</p>

      {b.method !== "direct" && b.status === "broken" && b.after && (
        <div className="mt-4">
          <MetricsBox title={`Даже в самом удачном случае (${fmt(b.direction === "max" ? b.range[0] : b.range[1], b.unit)})`} m={b.after} tone="bad" icon={<XCircle className="size-3.5" />} />
        </div>
      )}
      {b.method !== "direct" && b.status === "holds_all" && b.before && (
        <div className="mt-4">
          <MetricsBox title={`Даже при ${fmt(b.direction === "max" ? b.range[1] : b.range[0], b.unit)}`} m={b.before} tone="good" icon={<CheckCircle2 className="size-3.5" />} />
        </div>
      )}
      {b.method !== "direct" && b.status === "found" && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <MetricsBox title="На пределе" m={b.before} tone="good" icon={<CheckCircle2 className="size-3.5" />} />
          <MetricsBox title={`За пределом (+${fmt(b.step, b.unit)})`} m={b.after} tone="bad" icon={<XCircle className="size-3.5" />} />
        </div>
      )}
      {b.method === "direct" && b.after && <MetricsBox title="Что будет в этом сценарии" m={b.after} tone="bad" icon={<XCircle className="size-3.5" />} />}

      <details className="mt-4 text-sm">
        <summary className="cursor-pointer font-medium text-muted hover:text-fg">Как считали</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
          {b.assumptions.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </details>
    </Card>
  );
}

export default function BreakpointsPage() {
  const { model } = useWorkspace();
  const [mode, setMode] = useState<Mode>("stress");
  const [criterion, setCriterion] = useState<Criterion>("reserve");
  const [expenseMonth, setExpenseMonth] = useState(1);
  const bps = useMemo(() => findBreakpoints(model, { mode, criterion, expenseMonth: Math.min(expenseMonth, model.horizon) }), [model, mode, criterion, expenseMonth]);
  const criterionLabel = criterion === "reserve" ? `денег не меньше запаса (${formatRub(model.finances.minReserve)})` : "деньги не уходят в минус";

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent">
            <Target className="size-5" />
          </div>
          <div>
            <h2 className="font-display text-xl font-bold">Где ваш предел</h2>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted">Сценарий</p>
            <Segmented label="Сценарий" value={mode} onChange={setMode} options={(["base", "adverse", "stress"] as Mode[]).map((k) => ({ value: k, label: MODE_META[k].label }))} />
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted">Что для вас важно</p>
            <Segmented
              label="Что для вас важно"
              value={criterion}
              onChange={setCriterion}
              options={[
                { value: "reserve", label: "Не трогать запас" },
                { value: "zero", label: "Не уйти в минус" },
              ]}
            />
          </div>
          <div className="w-40 space-y-1.5">
            <label htmlFor="bp-month" className="text-xs font-medium text-muted">
              Месяц внезапной траты
            </label>
            <NumberInput id="bp-month" value={expenseMonth} onChange={(v) => setExpenseMonth(Math.max(1, v ?? 1))} min={1} max={model.horizon} suffix="мес" />
          </div>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        {bps.map((b) => (
          <BreakpointCard key={b.id} b={b} criterionLabel={criterionLabel} />
        ))}
      </div>
    </div>
  );
}
