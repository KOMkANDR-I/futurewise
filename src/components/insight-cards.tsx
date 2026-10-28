"use client";

import { useMemo, useState } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Banknote, Gauge, Shuffle, Waypoints } from "lucide-react";
import {
  MODE_META,
  moneyFlows,
  PDN_META,
  pdnLevel,
  runRanges,
  type CrashTestResult,
  type Mode,
  type ModelInput,
  type Quantiles,
} from "@/lib/engine";
import { Badge, Card, Segmented, inputClass } from "@/components/ui/primitives";
import { formatCompactRub, formatPct, formatRub, pluralMonths } from "@/lib/format";
import { cn } from "@/lib/utils";

const MODES: Mode[] = ["base", "adverse", "stress"];
const pct = (x: number) => formatPct(Math.round(x * 1000) / 10);
const levelTone = { low: "good", elevated: "warn", high: "bad", none: "neutral" } as const;

/* ───────────── Долговая нагрузка ───────────── */

export function PdnCard({ model, result }: { model: ModelInput; result: CrashTestResult }) {
  const f = model.finances;
  const incomeNow = f.income + f.extraIncome;
  const debtsNow = f.existingPayments + (f.debts ?? []).reduce((a, d) => a + d.monthlyPayment, 0);
  const now = incomeNow > 0 ? debtsNow / incomeNow : debtsNow > 0 ? null : 0;
  const items = [
    { key: "now", label: "Сейчас, до решения", pdn: now, month: null as number | null },
    ...MODES.map((k) => ({ key: k, label: `${MODE_META[k].label} сценарий, самый тяжёлый месяц`, pdn: result.modes[k].metrics.pdnMax, month: result.modes[k].metrics.pdnMaxMonth })),
  ];
  const worst = items.reduce((a, b) => ((b.pdn ?? Infinity) > (a.pdn ?? Infinity) ? b : a));
  const worstLevel = pdnLevel(worst.pdn);
  return (
    <Card className="p-5" data-tour="pdn">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 font-display text-lg font-bold">
            <Gauge className="size-4 text-accent" /> Долговая нагрузка (ПДН)
          </h2>
        </div>
        <Badge tone={levelTone[worstLevel]}>в худшем случае: {PDN_META[worstLevel].label.toLowerCase()}</Badge>
      </div>
      <div className="mt-4 space-y-3">
        {items.map((it) => {
          const lvl = pdnLevel(it.pdn);
          const width = it.pdn == null ? 100 : Math.min(100, it.pdn * 100);
          return (
            <div key={it.key}>
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span className="text-muted">
                  {it.label}
                  {it.month ? ` (${it.month}-й мес.)` : ""}
                </span>
                <span className="num font-semibold">{it.pdn == null ? "нет дохода" : pct(it.pdn)}</span>
              </div>
              <div className="relative mt-1 h-2.5 rounded-full bg-surface-2" aria-hidden>
                <div className={cn("absolute inset-y-0 left-0 rounded-full", lvl === "high" || lvl === "none" ? "bg-bad/70" : lvl === "elevated" ? "bg-warn/70" : "bg-good/70")} style={{ width: `${width}%` }} />
                <div className="absolute -top-0.5 h-3.5 w-px bg-fg/50" style={{ left: "50%" }} />
                <div className="absolute -top-0.5 h-3.5 w-px bg-fg/50" style={{ left: "80%" }} />
              </div>
            </div>
          );
        })}
        <div className="relative h-4 text-[10px] text-muted" aria-hidden>
          <span className="absolute -translate-x-1/2" style={{ left: "50%" }}>
            50%
          </span>
          <span className="absolute -translate-x-1/2" style={{ left: "80%" }}>
            80%
          </span>
        </div>
      </div>
      <p className="mt-2 text-sm">{PDN_META[worstLevel].text}</p>
    </Card>
  );
}

/* ───────────── Кредит: ПСК и график ───────────── */

export function LoanCard({ result }: { result: CrashTestResult }) {
  const p = result.plan;
  if (!p.loanSchedule) return null;
  return (
    <Card className="p-5">
      <h2 className="flex items-center gap-2 font-display text-lg font-bold">
        <Banknote className="size-4 text-accent" /> Кредит подробно
      </h2>
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-xl bg-surface-2/60 p-3">
          <div className="text-xs text-muted">Полная стоимость (ПСК)</div>
          <div className="num mt-1 font-display text-xl font-bold">{p.psk == null ? "—" : `${formatPct(p.psk)}`}</div>
        </div>
        <div className="rounded-xl bg-surface-2/60 p-3">
          <div className="text-xs text-muted">Переплата</div>
          <div className="num mt-1 font-display text-xl font-bold">{formatRub(p.overpayment)}</div>
        </div>
        <div className="rounded-xl bg-surface-2/60 p-3">
          <div className="text-xs text-muted">Платежей</div>
          <div className="num mt-1 font-display text-xl font-bold">{p.loanSchedule.length}</div>
          <div className="text-[11px] text-muted">из {pluralMonths(p.termMonths ?? 0)} по договору</div>
        </div>
        <div className="rounded-xl bg-surface-2/60 p-3">
          <div className="text-xs text-muted">Досрочка экономит</div>
          <div className={cn("num mt-1 font-display text-xl font-bold", p.interestSaved > 0 && "text-good")}>{p.interestSaved > 0 ? formatRub(p.interestSaved) : "—"}</div>
        </div>
      </div>
      <details className="mt-4 text-sm">
        <summary className="cursor-pointer font-medium text-muted hover:text-fg">График платежей</summary>
        <div className="mt-3 max-h-80 overflow-auto">
          <table className="num w-full min-w-[520px] text-right text-sm">
            <thead className="sticky top-0 bg-surface text-xs text-muted">
              <tr className="border-b">
                <th className="py-2 text-left font-medium">Месяц</th>
                <th className="py-2 font-medium">Платёж</th>
                <th className="py-2 font-medium">Проценты</th>
                <th className="py-2 font-medium">Долг гасится</th>
                <th className="py-2 font-medium">Досрочно</th>
                <th className="py-2 font-medium">Остаток долга</th>
              </tr>
            </thead>
            <tbody>
              {p.loanSchedule.map((r) => (
                <tr key={r.month} className="border-b border-border/50">
                  <td className="py-1.5 text-left text-muted">{r.month}</td>
                  <td className="py-1.5">{formatRub(r.payment)}</td>
                  <td className="py-1.5">{formatRub(r.interest)}</td>
                  <td className="py-1.5">{formatRub(r.principal)}</td>
                  <td className="py-1.5 text-good">{r.extra ? formatRub(r.extra) : "—"}</td>
                  <td className="py-1.5">{formatRub(r.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </Card>
  );
}

/* ───────────── Куда уходят деньги ───────────── */

const SRC_COLORS: Record<string, string> = {
  income: "rgb(var(--accent))",
  extra: "#60a5fa",
  decisionIn: "rgb(var(--violet))",
  interest: "rgb(var(--good))",
  savings: "rgb(var(--warn))",
};
const SINK_COLORS: Record<string, string> = {
  fixed: "#94a3b8",
  variable: "#60a5fa",
  credits: "rgb(var(--violet))",
  decision: "rgb(var(--accent))",
  events: "rgb(var(--bad))",
  saved: "rgb(var(--good))",
};

export function MoneyFlowCard({ model, result }: { model: ModelInput; result: CrashTestResult }) {
  const [mode, setMode] = useState<Mode>("base");
  const [month, setMonth] = useState<number>(0);
  const rows = result.modes[mode].rows;
  const selected = month === 0 ? rows : rows.filter((r) => r.month === month);
  const div = month === 0 ? Math.max(1, rows.length) : 1;
  const flow = useMemo(() => moneyFlows(model, selected), [model, selected]);

  const W = 640;
  const H = 300;
  const NODE_W = 12;
  const GAP = 10;
  const total = Math.max(1, flow.total);
  const layout = (nodes: { id: string; label: string; value: number }[]) => {
    const avail = H - GAP * Math.max(0, nodes.length - 1);
    let y = 0;
    return nodes.map((n) => {
      const h = Math.max(2, (n.value / total) * avail);
      const r = { ...n, y, h };
      y += h + GAP;
      return r;
    });
  };
  const L = layout(flow.sources);
  const R = layout(flow.sinks);
  // Деньги из всех источников попадают в общий кошелёк и расходуются пропорционально.
  const ribbons: { d: string; color: string; key: string; w: number }[] = [];
  const srcOffset = L.map(() => 0);
  const sinkOffset = R.map(() => 0);
  L.forEach((s, i) => {
    R.forEach((t, j) => {
      const share = (s.value * t.value) / (total * total);
      const hs = (share * total * s.h) / Math.max(1, s.value);
      const ht = (share * total * t.h) / Math.max(1, t.value);
      if (hs < 0.3) return;
      const y0 = s.y + srcOffset[i] + hs / 2;
      const y1 = t.y + sinkOffset[j] + ht / 2;
      srcOffset[i] += hs;
      sinkOffset[j] += ht;
      const x0 = 150 + NODE_W;
      const x1 = W - 170;
      ribbons.push({ key: `${s.id}-${t.id}`, color: SRC_COLORS[s.id] ?? "#888", w: (hs + ht) / 2, d: `M${x0},${y0} C${(x0 + x1) / 2},${y0} ${(x0 + x1) / 2},${y1} ${x1},${y1}` });
    });
  });

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-display text-lg font-bold">
            <Waypoints className="size-4 text-violet" /> Куда уходят деньги
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented size="sm" label="Сценарий" value={mode} onChange={setMode} options={MODES.map((k) => ({ value: k, label: MODE_META[k].label }))} />
          <select aria-label="Месяц" className={cn(inputClass, "h-8 w-48 py-0 text-xs")} value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            <option value={0}>В среднем за месяц</option>
            {rows.map((r) => (
              <option key={r.month} value={r.month}>
                {r.month}-й месяц
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="mt-4 overflow-x-auto">
        <svg viewBox={`-4 -8 ${W + 8} ${H + 16}`} className="mx-auto block min-w-[560px] w-full" role="img" aria-label="Схема: источники денег слева, траты справа">
          {ribbons.map((r) => (
            <path key={r.key} d={r.d} fill="none" stroke={r.color} strokeOpacity={0.28} strokeWidth={Math.max(1, r.w)} />
          ))}
          {L.map((n) => (
            <g key={n.id}>
              <rect x={150} y={n.y} width={NODE_W} height={n.h} rx={3} fill={SRC_COLORS[n.id] ?? "#888"} />
              <text x={142} y={n.y + n.h / 2} textAnchor="end" dominantBaseline="middle" fontSize={12} fill="rgb(var(--fg))">
                {n.label}
              </text>
              <text x={142} y={n.y + n.h / 2 + 14} textAnchor="end" dominantBaseline="middle" fontSize={10.5} fill="rgb(var(--muted))">
                {formatRub(n.value / div)}
              </text>
            </g>
          ))}
          {R.map((n) => (
            <g key={n.id}>
              <rect x={W - 170} y={n.y} width={NODE_W} height={n.h} rx={3} fill={SINK_COLORS[n.id] ?? "#888"} />
              <text x={W - 150} y={n.y + n.h / 2} dominantBaseline="middle" fontSize={12} fill="rgb(var(--fg))">
                {n.label}
              </text>
              <text x={W - 150} y={n.y + n.h / 2 + 14} dominantBaseline="middle" fontSize={10.5} fill="rgb(var(--muted))">
                {formatRub(n.value / div)} · {Math.round((n.value / total) * 100)}%
              </text>
            </g>
          ))}
        </svg>
      </div>
    </Card>
  );
}

/* ───────────── Разброс ───────────── */

export function FanChart({ fan, reserve, color = "rgb(var(--violet))" }: { fan: ({ month: number } & Quantiles)[]; reserve: number; color?: string }) {
  const data = fan.map((f) => ({ month: f.month, outer: [f.p5, f.p95], inner: [f.p25, f.p75], p50: f.p50 }));
  return (
    <div className="h-60">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
          <CartesianGrid stroke="rgb(var(--border))" strokeDasharray="3 5" vertical={false} />
          <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: "rgb(var(--muted))", fontSize: 12 }} />
          <YAxis tickLine={false} axisLine={false} width={62} tick={{ fill: "rgb(var(--muted))", fontSize: 12 }} tickFormatter={(v) => formatCompactRub(v)} />
          <ReferenceLine y={0} stroke="rgb(var(--bad))" strokeOpacity={0.7} />
          <ReferenceLine y={reserve} stroke="rgb(var(--violet))" strokeDasharray="6 4" />
          <Area type="monotone" dataKey="outer" stroke="none" fill={color} fillOpacity={0.15} isAnimationActive={false} />
          <Area type="monotone" dataKey="inner" stroke="none" fill={color} fillOpacity={0.3} isAnimationActive={false} />
          <Line type="monotone" dataKey="p50" stroke={color} strokeWidth={2.5} dot={false} />
          <Tooltip
            content={({ active, label }) => {
              if (!active) return null;
              const f = fan[(label as number) - 1];
              if (!f) return null;
              return (
                <div className="card p-3 text-xs">
                  <div className="mb-1 font-semibold">{label}-й месяц</div>
                  <div className="num space-y-0.5 text-muted">
                    <div>почти всегда больше {formatRub(f.p5)}</div>
                    <div>
                      чаще всего: от {formatRub(f.p25)} до {formatRub(f.p75)}
                    </div>
                    <div className="text-fg">обычно: {formatRub(f.p50)}</div>
                  </div>
                </div>
              );
            }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function RangeCard({ model }: { model: ModelInput }) {
  const [mode, setMode] = useState<Mode>("base");
  const r = useMemo(() => runRanges(model, mode, { runs: 600 }), [model, mode]);
  if (!r) return null;
  const tone = (x: number) => (x === 0 ? "text-good" : x < 0.2 ? "text-warn" : "text-bad");
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 font-display text-lg font-bold">
            <Shuffle className="size-4 text-accent" /> Если цифры будут плавать
          </h2>
          <p className="mt-1 text-xs text-muted">
            доход ±{r.incomeVarPct}%, расходы ±{r.expenseVarPct}%, {r.runs} пересчётов
          </p>
        </div>
        <Segmented size="sm" label="Сценарий" value={mode} onChange={setMode} options={MODES.map((k) => ({ value: k, label: MODE_META[k].label }))} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl bg-surface-2/60 p-3">
          <div className="text-xs text-muted">Запас будет тронут</div>
          <div className={cn("num mt-1 font-display text-xl font-bold", tone(r.pReserveBreach))}>{pct(r.pReserveBreach)}</div>
        </div>
        <div className="rounded-xl bg-surface-2/60 p-3">
          <div className="text-xs text-muted">Денег не хватит</div>
          <div className={cn("num mt-1 font-display text-xl font-bold", tone(r.pDeficit))}>{pct(r.pDeficit)}</div>
        </div>
        <div className="rounded-xl bg-surface-2/60 p-3">
          <div className="text-xs text-muted">Обычно в трудный момент</div>
          <div className="num mt-1 font-display text-xl font-bold">{formatRub(r.minBalance.p50)}</div>
        </div>
        <div className="rounded-xl bg-surface-2/60 p-3">
          <div className="text-xs text-muted">В 5% самых плохих случаев</div>
          <div className={cn("num mt-1 font-display text-xl font-bold", r.minBalance.p5 < 0 ? "text-bad" : r.minBalance.p5 < model.finances.minReserve ? "text-warn" : "")}>{formatRub(r.minBalance.p5)}</div>
        </div>
      </div>
      <div className="mt-5">
        <FanChart fan={r.fan} reserve={model.finances.minReserve} color="rgb(var(--accent))" />
      </div>
    </Card>
  );
}
