"use client";

import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Dices } from "lucide-react";
import type { ProbabilisticResult } from "@/lib/engine";
import { Badge, Card } from "@/components/ui/primitives";
import { formatCompactRub, formatPct, formatRub } from "@/lib/format";
import { cn } from "@/lib/utils";

const pct = (x: number) => formatPct(Math.round(x * 1000) / 10);

export function ProbabilityCard({ prob, reserve, baseBroken = false }: { prob: ProbabilisticResult | null; reserve: number; baseBroken?: boolean }) {
  if (!prob) return null;

  const data = prob.fan.map((f) => ({ month: f.month, outer: [f.p5, f.p95], inner: [f.p25, f.p75], p50: f.p50 }));
  const tone = (x: number) => (x === 0 ? "text-good" : x < 0.2 ? "text-warn" : "text-bad");
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 font-display text-lg font-bold">
            <Dices className="size-4 text-violet" /> С учётом ваших вероятностей
          </h2>
        </div>
        <Badge tone="violet">{prob.runs} вариантов</Badge>
      </div>
      {baseBroken && (
        <p className="mt-3 rounded-xl border border-bad/30 bg-bad/5 p-3 text-sm text-bad">
          Запас тронут и без событий — дело в самом решении.
        </p>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl bg-surface-2/60 p-3">
          <div className="text-xs text-muted">Запас будет тронут</div>
          <div className={cn("num mt-1 font-display text-xl font-bold", tone(prob.pReserveBreach))}>{pct(prob.pReserveBreach)}</div>
        </div>
        <div className="rounded-xl bg-surface-2/60 p-3">
          <div className="text-xs text-muted">Денег не хватит</div>
          <div className={cn("num mt-1 font-display text-xl font-bold", tone(prob.pDeficit))}>{pct(prob.pDeficit)}</div>
        </div>
        <div className="rounded-xl bg-surface-2/60 p-3">
          <div className="text-xs text-muted">Обычно в трудный момент</div>
          <div className="num mt-1 font-display text-xl font-bold">{formatRub(prob.minBalance.p50)}</div>
        </div>
        <div className="rounded-xl bg-surface-2/60 p-3">
          <div className="text-xs text-muted">В 5% самых плохих случаев</div>
          <div className={cn("num mt-1 font-display text-xl font-bold", prob.minBalance.p5 < 0 ? "text-bad" : prob.minBalance.p5 < reserve ? "text-warn" : "")}>{formatRub(prob.minBalance.p5)}</div>
        </div>
      </div>

      <div className="mt-5 h-60">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
            <CartesianGrid stroke="rgb(var(--border))" strokeDasharray="3 5" vertical={false} />
            <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: "rgb(var(--muted))", fontSize: 12 }} />
            <YAxis tickLine={false} axisLine={false} width={62} tick={{ fill: "rgb(var(--muted))", fontSize: 12 }} tickFormatter={(v) => formatCompactRub(v)} />
            <ReferenceLine y={0} stroke="rgb(var(--bad))" strokeOpacity={0.7} />
            <ReferenceLine y={reserve} stroke="rgb(var(--violet))" strokeDasharray="6 4" />
            <Area type="monotone" dataKey="outer" stroke="none" fill="rgb(var(--violet))" fillOpacity={0.15} isAnimationActive={false} />
            <Area type="monotone" dataKey="inner" stroke="none" fill="rgb(var(--violet))" fillOpacity={0.3} isAnimationActive={false} />
            <Line type="monotone" dataKey="p50" stroke="rgb(var(--violet))" strokeWidth={2.5} dot={false} />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const f = prob.fan[(label as number) - 1];
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

      <div className="mt-5 overflow-x-auto">
        <table className="num w-full min-w-[520px] text-sm">
          <caption className="sr-only">Как каждое событие влияет на запас</caption>
          <thead className="text-xs text-muted">
            <tr className="border-b text-right">
              <th className="py-2 text-left font-medium">Событие</th>
              <th className="py-2 font-medium">Вероятность</th>
              <th className="py-2 font-medium">Запас тронут, если случится</th>
              <th className="py-2 font-medium">…если не случится</th>
            </tr>
          </thead>
          <tbody>
            {prob.conditional.map((c) => {
              const u = prob.used.find((x) => x.id === c.id)!;
              return (
                <tr key={c.id} className="border-b border-border/50 text-right">
                  <td className="py-2 text-left">{c.label}</td>
                  <td className="py-2">{formatPct(u.probability)}</td>
                  <td className={cn("py-2 font-semibold", tone(c.ifHappens))}>{pct(c.ifHappens)}</td>
                  <td className={cn("py-2", tone(c.ifNot))}>{pct(c.ifNot)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {prob.ignored.length > 0 && <p className="mt-3 text-xs text-muted">Без вероятности: {prob.ignored.map((i) => i.label).join("; ")}.</p>}
    </Card>
  );
}
