"use client";

import { useMemo, useState } from "react";
import { Check, Scale, X } from "lucide-react";
import { compareAlternatives, MODE_META, resolveSettings, type Mode } from "@/lib/engine";
import { useWorkspace } from "@/components/workspace/context";
import { BalanceChart, PALETTE } from "@/components/balance-chart";
import { Button } from "@/components/ui/button";
import { Badge, Card, Dialog, Segmented } from "@/components/ui/primitives";
import { formatRub, fromMonth } from "@/lib/format";
import { cn } from "@/lib/utils";

const MODES: Mode[] = ["base", "adverse", "stress"];

export default function ComparePage() {
  const { model, setModel } = useWorkspace();
  const { results, tradeoffs } = useMemo(() => compareAlternatives(model), [model]);
  const available = results.filter((r) => r.alt.available);
  const [mode, setMode] = useState<Mode>("stress");
  const [selected, setSelected] = useState<string[]>(() => available.slice(0, 3).map((r) => r.alt.id));
  const [applyId, setApplyId] = useState<string | null>(null);
  const reserve = model.finances.minReserve;

  const color = (id: string) => PALETTE[Math.max(0, results.findIndex((r) => r.alt.id === id)) % PALETTE.length];
  const shown = available.filter((r) => selected.includes(r.alt.id));
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? (s.length > 1 ? s.filter((x) => x !== id) : s) : [...s, id]));
  const applying = results.find((r) => r.alt.id === applyId);

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent">
            <Scale className="size-5" />
          </div>
          <div>
            <h2 className="font-display text-xl font-bold">А если сделать иначе?</h2>
          </div>
        </div>
      </Card>

      {tradeoffs.length > 0 && (
        <Card className="p-5">
          <h3 className="font-semibold">Плюсы и минусы</h3>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-muted">
            {tradeoffs.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-display text-lg font-bold">Сколько денег будет по месяцам</h3>
          <Segmented label="Сценарий" size="sm" value={mode} onChange={setMode} options={MODES.map((k) => ({ value: k, label: MODE_META[k].label }))} />
        </div>
        <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Какие варианты показать">
          {available.map((r) => {
            const on = selected.includes(r.alt.id);
            return (
              <button
                key={r.alt.id}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(r.alt.id)}
                className={cn("flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition", on ? "border-accent/50 bg-surface-2" : "text-muted")}
              >
                <span className="size-2.5 rounded-full" style={{ background: color(r.alt.id) }} />
                {r.alt.title}
                {on ? <Check className="size-3" /> : null}
              </button>
            );
          })}
        </div>
        <BalanceChart
          key={`${mode}-${shown.map((s) => s.alt.id).join()}`}
          reserve={reserve}
          valueKey={resolveSettings(model.settings).cashTiming === "payday" ? "lowPoint" : "end"}
          series={shown.map((r) => ({ key: r.alt.id, label: r.alt.title, color: color(r.alt.id), rows: r.modes[mode].rows, startBalance: r.alt.model.finances.savings, dashed: r.alt.id !== "original" }))}
        />
      </Card>

      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="num w-full min-w-[860px] text-sm">
            <caption className="sr-only">Сравнение вариантов</caption>
            <thead className="text-xs text-muted">
              <tr className="border-b text-right">
                <th className="p-3 text-left font-medium">Вариант</th>
                <th className="p-3 font-medium">Всего потратите</th>
                <th className="p-3 font-medium">Переплата</th>
                <th className="p-3 font-medium">Платёж</th>
                <th className="p-3 font-medium">Когда</th>
                {MODES.map((k) => (
                  <th key={k} className="p-3 font-medium">
                    Минимум: {MODE_META[k].short.toLowerCase()}
                  </th>
                ))}
                <th className="p-3 font-medium">Не хватит денег</th>
                <th className="p-3 text-center font-medium">Запас цел везде</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {results.map((r) => {
                const s = r.summary;
                const firstDef = MODES.map((k) => s.firstDeficit[k]).filter((x): x is number => x != null);
                return (
                  <tr key={r.alt.id} className={cn("border-b border-border/50 text-right align-top", !r.alt.available && "opacity-50")}>
                    <td className="max-w-[260px] p-3 text-left">
                      <div className="flex items-center gap-2 font-semibold">
                        <span className="size-2.5 shrink-0 rounded-full" style={{ background: color(r.alt.id) }} />
                        {r.alt.title}
                      </div>
                      <div className="mt-0.5 text-xs text-muted">{r.alt.available ? r.alt.changes.join("; ") || r.alt.description : r.alt.unavailableReason}</div>
                    </td>
                    <td className="p-3">{formatRub(s.totalCost)}</td>
                    <td className="p-3">{s.overpayment > 0 ? formatRub(s.overpayment) : "—"}</td>
                    <td className="p-3">{s.monthlyPayment ? formatRub(s.monthlyPayment) : "—"}</td>
                    <td className="p-3">{s.acquireMonth ? (s.acquiredInHorizon ? `${s.acquireMonth}-й мес.` : "позже срока") : "—"}</td>
                    {MODES.map((k) => (
                      <td key={k} className={cn("p-3 font-semibold", s.minBalance[k] < 0 ? "text-bad" : s.minBalance[k] < reserve ? "text-warn" : "text-fg")}>
                        {formatRub(s.minBalance[k])}
                      </td>
                    ))}
                    <td className="p-3">{firstDef.length ? fromMonth(Math.min(...firstDef)) : "нет"}</td>
                    <td className="p-3 text-center">{s.reserveOkAllModes ? <Check className="inline size-4 text-good" aria-label="да" /> : <X className="inline size-4 text-bad" aria-label="нет" />}</td>
                    <td className="p-3">
                      {r.alt.available && r.alt.id !== "original" && (
                        <Button size="sm" variant="ghost" onClick={() => setApplyId(r.alt.id)}>
                          Применить
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        {available
          .filter((r) => r.alt.id !== "original")
          .map((r) => (
            <Card key={r.alt.id} className="p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{r.alt.title}</span>
                {r.summary.reserveOkAllModes ? <Badge tone="good">запас цел</Badge> : <Badge tone="warn">запас может пострадать</Badge>}
              </div>
              <p className="mt-1 text-sm text-muted">{r.alt.description}</p>
            </Card>
          ))}
      </div>

      <Dialog open={!!applying} onOpenChange={(v) => !v && setApplyId(null)} title="Взять этот вариант?" description={applying ? `Ваш сценарий изменится на вариант «${applying.alt.title}»: ${applying.alt.changes.join("; ")}.` : undefined}>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setApplyId(null)}>
            Отмена
          </Button>
          <Button
            onClick={() => {
              if (applying) setModel(applying.alt.model);
              setApplyId(null);
            }}
          >
            Применить
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
