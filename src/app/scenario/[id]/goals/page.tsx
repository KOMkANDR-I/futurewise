"use client";

import { useMemo, useState } from "react";
import { Flag, Target } from "lucide-react";
import { describeEvent, evaluateGoals, MODE_META, type Goal, type Mode } from "@/lib/engine";
import { useWorkspace } from "@/components/workspace/context";
import { GoalsEditor } from "@/components/list-editors";
import { Badge, Card, Segmented } from "@/components/ui/primitives";
import { formatRub, inMonth } from "@/lib/format";
import { cn } from "@/lib/utils";

const MODES: Mode[] = ["base", "adverse", "stress"];

const STATUS_TEXT = {
  on_time: { label: "успеваете", tone: "good" },
  late: { label: "опоздаете", tone: "warn" },
  not_reached: { label: "не успеете за срок расчёта", tone: "bad" },
  no_deadline: { label: "накопите", tone: "accent" },
} as const;

export default function GoalsPage() {
  const { model, setModel, result } = useWorkspace();
  const [mode, setMode] = useState<Mode>("base");
  const goals = model.goals ?? [];
  const byMode = useMemo(() => Object.fromEntries(MODES.map((k) => [k, evaluateGoals(model, result.modes[k])])) as Record<Mode, ReturnType<typeof evaluateGoals>>, [model, result]);
  const H = model.horizon;
  const pos = (m: number) => `${((m - 0.5) / H) * 100}%`;
  const events = model.events.filter((e) => e.enabled && (mode === "stress" || (mode === "adverse" && e.tier === "adverse")));
  const decisionMonth = result.plan.acquireMonth;

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent">
            <Target className="size-5" />
          </div>
          <div>
            <h2 className="font-display text-xl font-bold">Цели</h2>
          </div>
        </div>
        <div className="mt-5">
          <GoalsEditor goals={goals} horizon={H} onChange={(g: Goal[]) => setModel({ ...model, goals: g })} />
        </div>
      </Card>

      {goals.length > 0 && (
        <>
          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-display text-lg font-bold">Когда получится</h3>
              <Segmented label="Сценарий" size="sm" value={mode} onChange={setMode} options={MODES.map((k) => ({ value: k, label: MODE_META[k].label }))} />
            </div>

            <div className="mt-6 overflow-x-auto">
              <div className="relative min-w-[560px] pb-2 pt-10">
                <div className="absolute inset-x-0 top-[60px] h-1 rounded-full bg-surface-2" aria-hidden />
                {decisionMonth != null && decisionMonth <= H && model.kind !== "cushion" && (
                  <div className="absolute top-0 -translate-x-1/2 text-center" style={{ left: pos(decisionMonth) }}>
                    <div className="whitespace-nowrap rounded-md bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent">решение</div>
                    <div className="mx-auto mt-1 h-6 w-0.5 bg-accent" />
                  </div>
                )}
                {events.map((e) => (
                  <div key={e.id} className="absolute top-[52px] -translate-x-1/2" style={{ left: pos(Math.min(H, e.month)) }} title={describeEvent(e)}>
                    <div className="size-4 rounded-full border-2 border-surface bg-warn" />
                  </div>
                ))}
                <div className="relative mt-6 grid" style={{ gridTemplateColumns: `repeat(${H}, minmax(0, 1fr))` }}>
                  {Array.from({ length: H }, (_, i) => (
                    <div key={i} className="text-center text-[10px] text-muted">
                      {i + 1}
                    </div>
                  ))}
                </div>
                <div className="mt-4 space-y-2">
                  {byMode[mode].map((g, i) => (
                    <div key={g.goal.id} className="relative h-8">
                      {g.goal.targetMonth != null && g.goal.targetMonth <= H && (
                        <div className="absolute top-1 h-6 w-0.5 -translate-x-1/2 bg-fg/40" style={{ left: pos(g.goal.targetMonth) }} title={`Хотите к ${g.goal.targetMonth}-му месяцу`} />
                      )}
                      <div
                        className={cn("absolute top-1.5 h-5 rounded-full", g.reachedMonth ? (g.status === "late" ? "bg-warn/40" : "bg-good/40") : "bg-bad/25")}
                        style={{ left: 0, width: g.reachedMonth ? `${(g.reachedMonth / H) * 100}%` : "100%" }}
                      />
                      {g.reachedMonth && (
                        <div className="absolute top-0.5 -translate-x-1/2" style={{ left: pos(g.reachedMonth) }}>
                          <Flag className={cn("size-6", g.status === "late" ? "text-warn" : "text-good")} />
                        </div>
                      )}
                      <span className="absolute left-2 top-1.5 text-xs font-medium">
                        {i + 1}. {g.goal.name || "Цель"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted">
              <span className="flex items-center gap-1.5">
                <Flag className="size-3.5 text-good" /> когда накопите
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-0.5 bg-fg/40" /> когда хотите
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-3 rounded-full bg-warn" /> события сценария
              </span>
            </div>
          </Card>

          <Card className="p-0">
            <div className="overflow-x-auto">
              <table className="num w-full min-w-[640px] text-sm">
                <thead className="text-xs text-muted">
                  <tr className="border-b text-left">
                    <th className="p-3 font-medium">Цель</th>
                    <th className="p-3 font-medium">Сумма</th>
                    <th className="p-3 font-medium">Хотите к</th>
                    {MODES.map((k) => (
                      <th key={k} className="p-3 font-medium">
                        {MODE_META[k].label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {goals.map((g, i) => (
                    <tr key={g.id} className="border-b border-border/50 align-top">
                      <td className="p-3 font-medium">
                        {i + 1}. {g.name || "Цель"}
                      </td>
                      <td className="p-3">{formatRub(g.amount)}</td>
                      <td className="p-3">{g.targetMonth ? `${g.targetMonth}-му месяцу` : "без срока"}</td>
                      {MODES.map((k) => {
                        const st = byMode[k][i];
                        const meta = STATUS_TEXT[st.status];
                        return (
                          <td key={k} className="p-3">
                            <Badge tone={meta.tone}>{meta.label}</Badge>
                            {st.reachedMonth && <div className="mt-1 text-xs text-muted">{inMonth(st.reachedMonth)}</div>}
                            {st.status === "late" && <div className="text-xs text-warn">на {st.lateBy} мес. позже</div>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
