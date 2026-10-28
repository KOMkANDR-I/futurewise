"use client";

import { useMemo, useState } from "react";
import { CalendarDays } from "lucide-react";
import { Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { buildCalendar, MODE_META, resolveSettings, type Mode } from "@/lib/engine";
import { useWorkspace } from "@/components/workspace/context";
import { Badge, Card, Segmented, inputClass } from "@/components/ui/primitives";
import { formatCompactRub, formatRub } from "@/lib/format";
import { cn } from "@/lib/utils";

const MODES: Mode[] = ["base", "adverse", "stress"];

export default function CalendarPage() {
  const { model, result } = useWorkspace();
  const [mode, setMode] = useState<Mode>("base");
  const rows = result.modes[mode].rows;
  // По умолчанию — самый трудный месяц выбранного сценария.
  const hardest = result.modes[mode].metrics.minMonth || 1;
  const [month, setMonth] = useState<number | null>(null);
  const m = Math.min(month ?? hardest, rows.length);
  const row = rows[m - 1];
  const reserve = model.finances.minReserve;
  const cal = useMemo(() => buildCalendar(row, reserve), [row, reserve]);
  const s = resolveSettings(model.settings);

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent">
            <CalendarDays className="size-5" />
          </div>
          <div>
            <h2 className="font-display text-xl font-bold">Календарь платежей</h2>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Segmented label="Сценарий" size="sm" value={mode} onChange={setMode} options={MODES.map((k) => ({ value: k, label: MODE_META[k].label }))} />
          <select aria-label="Месяц" className={cn(inputClass, "h-9 w-48 py-0")} value={m} onChange={(e) => setMonth(Number(e.target.value))}>
            {rows.map((r) => (
              <option key={r.month} value={r.month}>
                {r.month}-й месяц{r.month === hardest ? " — самый трудный" : ""}
              </option>
            ))}
          </select>
          <Badge tone={cal.min < 0 ? "bad" : cal.min < reserve ? "warn" : "good"}>
            меньше всего {formatRub(cal.min)} — {cal.lowestDay.day}-го
          </Badge>
        </div>
      </Card>

      <Card className="p-5">
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={[{ day: 0, low: row.start }, ...cal.days.map((d) => ({ day: d.day, low: d.low }))]} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
              <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fill: "rgb(var(--muted))", fontSize: 11 }} />
              <YAxis tickLine={false} axisLine={false} width={60} tick={{ fill: "rgb(var(--muted))", fontSize: 11 }} tickFormatter={(v) => formatCompactRub(v)} />
              <ReferenceLine y={0} stroke="rgb(var(--bad))" strokeOpacity={0.7} />
              <ReferenceLine y={reserve} stroke="rgb(var(--violet))" strokeDasharray="6 4" />
              <Tooltip formatter={(v: number) => formatRub(v)} labelFormatter={(d) => (d === 0 ? "Начало месяца" : `${d}-е число`)} contentStyle={{ background: "rgb(var(--surface))", border: "1px solid rgb(var(--border))", borderRadius: 12, fontSize: 12 }} />
              <Line type="stepAfter" dataKey="low" name="Денег на счёте" stroke="rgb(var(--accent))" strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-2 text-xs text-muted">
          {formatRub(row.start)} → {formatRub(row.end)} · траты ≈ {formatRub(cal.spreadPerDay)}/день
        </p>
      </Card>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
        {cal.days.map((d) => (
          <div
            key={d.day}
            className={cn(
              "rounded-xl border p-2.5 text-xs",
              d.belowZero ? "border-bad/50 bg-bad/5" : d.belowReserve ? "border-warn/50 bg-warn/5" : "bg-surface",
              d.day === cal.lowestDay.day && "ring-2 ring-accent",
            )}
          >
            <div className="flex items-center justify-between">
              <span className="font-display text-sm font-bold">{d.day}</span>
              <span className={cn("num font-semibold", d.belowZero ? "text-bad" : d.belowReserve ? "text-warn" : "text-muted")}>{formatCompactRub(d.low)}</span>
            </div>
            <ul className="mt-1.5 space-y-0.5">
              {d.ops.map((o, i) => (
                <li key={i} className="flex justify-between gap-1">
                  <span className="truncate text-muted" title={o.label}>
                    {o.label}
                  </span>
                  <span className={cn("num shrink-0", o.amount > 0 ? "text-good" : "text-fg")}>
                    {o.amount > 0 ? "+" : "−"}
                    {formatCompactRub(Math.abs(o.amount))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
