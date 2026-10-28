"use client";

import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { MonthRow } from "@/lib/engine";
import { formatCompactRub, formatRub } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface ChartSeries {
  key: string;
  label: string;
  color: string;
  rows: MonthRow[];
  startBalance: number;
  dashed?: boolean;
}

export const SERIES_COLORS = {
  base: "rgb(var(--accent))",
  adverse: "rgb(var(--violet))",
  stress: "rgb(var(--warn))",
};

export const PALETTE = ["rgb(var(--accent))", "rgb(var(--violet))", "rgb(var(--warn))", "#60a5fa", "#f472b6", "#a3e635", "#94a3b8", "#fb923c"];

type Datum = Record<string, number> & { month: number };

export function BalanceChart({
  series,
  reserve,
  height = 340,
  initiallyHidden = [],
  caption,
  valueKey = "end",
}: {
  series: ChartSeries[];
  reserve: number;
  height?: number;
  initiallyHidden?: string[];
  caption?: string;
  /** end — остаток на конец месяца; lowPoint — самая низкая точка месяца (дневная модель). */
  valueKey?: "end" | "lowPoint";
}) {
  const [hidden, setHidden] = useState<Set<string>>(new Set(initiallyHidden));
  const data = useMemo<Datum[]>(() => {
    const H = Math.max(0, ...series.map((s) => s.rows.length));
    const out: Datum[] = [];
    for (let m = 0; m <= H; m++) {
      const d: Datum = { month: m } as Datum;
      for (const s of series) d[s.key] = m === 0 ? s.startBalance : s.rows[m - 1]?.[valueKey] ?? NaN;
      out.push(d);
    }
    return out;
  }, [series, valueKey]);

  const visible = series.filter((s) => !hidden.has(s.key));
  const values = data.flatMap((d) => visible.map((s) => d[s.key])).filter(Number.isFinite);
  const lo = Math.min(0, reserve, ...values);
  const hi = Math.max(reserve, ...values, 1);
  const pad = (hi - lo) * 0.08;

  const toggle = (k: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else if (series.length - next.size > 1) next.add(k);
      return next;
    });

  const renderDot =
    (s: ChartSeries) =>
    (props: { cx?: number; cy?: number; payload?: Datum; index?: number }) => {
      const { cx, cy, payload } = props;
      const key = `${s.key}-${props.index}`;
      if (cx == null || cy == null || !payload || payload.month === 0) return <g key={key} />;
      // Отметки берутся из флагов ядра, чтобы совпадать с карточками и таблицей.
      const row = s.rows[payload.month - 1];
      if (row?.belowZero) return <circle key={key} cx={cx} cy={cy} r={5} fill="rgb(var(--bad))" stroke="rgb(var(--surface))" strokeWidth={2} />;
      if (row?.belowReserve) return <circle key={key} cx={cx} cy={cy} r={4.5} fill="rgb(var(--surface))" stroke="rgb(var(--warn))" strokeWidth={2.5} />;
      return <g key={key} />;
    };

  return (
    <figure className="space-y-3">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Какие линии показывать">
        {series.map((s) => {
          const on = !hidden.has(s.key);
          return (
            <button
              key={s.key}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(s.key)}
              className={cn("flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition", on ? "bg-surface-2 text-fg" : "text-muted opacity-60 hover:opacity-100")}
            >
              <span className="h-0.5 w-4 rounded-full" style={{ background: s.color }} />
              {s.label}
            </button>
          );
        })}
        <span className="ml-auto hidden items-center gap-3 text-xs text-muted md:flex">
          <span className="flex items-center gap-1.5">
            <span className="w-4 border-t-2 border-dashed border-violet" /> ваш запас {formatRub(reserve)}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 border-t-2 border-bad/70" /> ноль рублей
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full border-2 border-warn" /> меньше запаса
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-bad" /> денег не хватает
          </span>
        </span>
      </div>
      <div style={{ height }} className="-ml-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 12, left: 4, bottom: 0 }}>
            <CartesianGrid stroke="rgb(var(--border))" strokeDasharray="3 5" vertical={false} />
            <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: "rgb(var(--muted))", fontSize: 12 }} tickFormatter={(m) => (m === 0 ? "сейчас" : String(m))} />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={62}
              tick={{ fill: "rgb(var(--muted))", fontSize: 12 }}
              tickFormatter={(v) => formatCompactRub(v)}
              domain={[Math.floor(lo - pad), Math.ceil(hi + pad)]}
            />
            <ReferenceLine y={0} stroke="rgb(var(--bad))" strokeOpacity={0.7} strokeWidth={1.5} />
            <ReferenceLine y={reserve} stroke="rgb(var(--violet))" strokeDasharray="6 4" strokeWidth={1.5} />
            <Tooltip content={<ChartTooltip series={visible} reserve={reserve} />} cursor={{ stroke: "rgb(var(--muted))", strokeOpacity: 0.4 }} />
            {visible.map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={s.color}
                strokeWidth={2.5}
                strokeDasharray={s.dashed ? "6 4" : undefined}
                dot={renderDot(s)}
                activeDot={{ r: 5, strokeWidth: 0 }}
                isAnimationActive
                animationDuration={500}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      {caption && <figcaption className="text-xs text-muted">{caption}</figcaption>}
    </figure>
  );
}

function ChartTooltip({ active, payload, label, series, reserve }: { active?: boolean; payload?: { dataKey: string; value: number }[]; label?: number; series: ChartSeries[]; reserve: number }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="card min-w-[220px] p-3 text-xs">
      <div className="mb-2 font-semibold">{label === 0 ? "Сейчас (ваши накопления)" : `${label}-й месяц`}</div>
      <div className="space-y-1.5">
        {series.map((s) => {
          const p = payload.find((x) => x.dataKey === s.key);
          if (!p) return null;
          const v = p.value;
          const row = label ? s.rows[label - 1] : undefined;
          return (
            <div key={s.key}>
              <div className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-1.5 text-muted">
                  <span className="size-2 rounded-full" style={{ background: s.color }} />
                  {s.label}
                </span>
                <span className={cn("num font-semibold", v < 0 ? "text-bad" : v < reserve ? "text-warn" : "text-fg")}>{formatRub(v)}</span>
              </div>
              {row && (
                <div className="num pl-3.5 text-[11px] text-muted">
                  +{formatRub(row.inflows)} / −{formatRub(row.outflows)}
                  {row.eventCosts > 0 && ` · из-за событий ${formatRub(row.eventCosts)}`}
                  {row.lowPoint < row.end - 0.5 && (
                    <div className={cn(row.lowPoint < 0 ? "text-bad" : row.lowPoint < reserve ? "text-warn" : "")}>
                      в конце месяца {formatRub(row.end)}, а до зарплаты — {formatRub(row.lowPoint)}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-2 border-t pt-2 text-[11px] text-muted">Ваш запас: {formatRub(reserve)}</div>
    </div>
  );
}
