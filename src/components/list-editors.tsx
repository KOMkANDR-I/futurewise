"use client";

import { Plus, Trash2 } from "lucide-react";
import type { Debt, EarlyRepayment, Goal } from "@/lib/engine";
import { Button } from "@/components/ui/button";
import { Field, Input, NumberInput, Segmented, inputClass } from "@/components/ui/primitives";
import { formatRub } from "@/lib/format";
import { cn } from "@/lib/utils";

const uid = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const DEBT_KINDS: { value: Debt["kind"]; label: string }[] = [
  { value: "loan", label: "Кредит" },
  { value: "installment", label: "Рассрочка" },
  { value: "card", label: "Кредитная карта" },
  { value: "other", label: "Другое" },
];

/** Список действующих долгов: у каждого свой платёж, срок и день списания. */
export function DebtsEditor({ debts, onChange }: { debts: Debt[]; onChange: (d: Debt[]) => void }) {
  const set = (i: number, patch: Partial<Debt>) => onChange(debts.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const total = debts.reduce((a, d) => a + d.monthlyPayment, 0);
  return (
    <div className="space-y-3">
      {debts.length === 0 && <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted">Нет</p>}
      {debts.map((d, i) => (
        <div key={d.id} className="grid gap-3 rounded-2xl border bg-surface-2/40 p-3 sm:grid-cols-[1.4fr_1fr_1fr_1fr_0.8fr_auto] sm:items-end">
          <Field label="Что это" htmlFor={`${d.id}-n`}>
            <Input id={`${d.id}-n`} value={d.name} maxLength={60} placeholder="Например, рассрочка на телефон" onChange={(e) => set(i, { name: e.target.value })} />
          </Field>
          <Field label="Вид" htmlFor={`${d.id}-k`}>
            <select id={`${d.id}-k`} className={cn(inputClass, "py-0")} value={d.kind} onChange={(e) => set(i, { kind: e.target.value as Debt["kind"] })}>
              {DEBT_KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Платёж в месяц" htmlFor={`${d.id}-p`}>
            <NumberInput id={`${d.id}-p`} value={d.monthlyPayment} min={0} suffix="₽" onChange={(v) => set(i, { monthlyPayment: v ?? 0 })} />
          </Field>
          <Field label="Осталось платежей" htmlFor={`${d.id}-m`} hint="0 — без срока">
            <NumberInput id={`${d.id}-m`} value={d.monthsLeft} min={0} max={360} suffix="мес" onChange={(v) => set(i, { monthsLeft: v ?? 0 })} />
          </Field>
          <Field label="День списания" htmlFor={`${d.id}-d`}>
            <NumberInput id={`${d.id}-d`} value={d.day} allowEmpty min={1} max={28} placeholder="—" onChange={(v) => set(i, { day: v == null ? null : Math.min(28, Math.max(1, v)) })} />
          </Field>
          <Button type="button" variant="ghost" size="icon" onClick={() => onChange(debts.filter((_, j) => j !== i))} aria-label={`Удалить «${d.name || "долг"}»`}>
            <Trash2 />
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={debts.length >= 30}
          onClick={() => onChange([...debts, { id: uid("debt"), name: "", kind: "loan", monthlyPayment: 0, monthsLeft: 0, day: null }])}
        >
          <Plus /> Добавить кредит или рассрочку
        </Button>
        {total > 0 && <span className="text-sm text-muted">Сейчас по долгам: {formatRub(total)} в месяц</span>}
      </div>
    </div>
  );
}

/** Досрочные погашения кредита. */
export function EarlyEditor({ early, onChange, horizon }: { early: EarlyRepayment[]; onChange: (e: EarlyRepayment[]) => void; horizon: number }) {
  const set = (i: number, patch: Partial<EarlyRepayment>) => onChange(early.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  return (
    <div className="space-y-3">
      {early.map((e, i) => (
        <div key={e.id} className="grid gap-3 rounded-2xl border bg-surface-2/40 p-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
          <Field label="В каком месяце" htmlFor={`${e.id}-m`}>
            <NumberInput id={`${e.id}-m`} value={e.month} min={1} max={Math.max(horizon, 360)} suffix="мес" onChange={(v) => set(i, { month: Math.max(1, v ?? 1) })} />
          </Field>
          <Field label="Сколько внесёте" htmlFor={`${e.id}-a`}>
            <NumberInput id={`${e.id}-a`} value={e.amount} min={0} suffix="₽" onChange={(v) => set(i, { amount: v ?? 0 })} />
          </Field>
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Что уменьшить</p>
            <Segmented
              size="sm"
              label="Что уменьшить"
              value={e.mode}
              onChange={(mode) => set(i, { mode })}
              options={[
                { value: "term", label: "Срок" },
                { value: "payment", label: "Платёж" },
              ]}
            />
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={() => onChange(early.filter((_, j) => j !== i))} aria-label="Удалить досрочный платёж">
            <Trash2 />
          </Button>
        </div>
      ))}
      <Button type="button" variant="secondary" size="sm" disabled={early.length >= 24} onClick={() => onChange([...early, { id: uid("early"), month: 6, amount: 30000, mode: "term" }])}>
        <Plus /> Добавить досрочный платёж
      </Button>
    </div>
  );
}

/** Цели накоплений по порядку. */
export function GoalsEditor({ goals, onChange, horizon }: { goals: Goal[]; onChange: (g: Goal[]) => void; horizon: number }) {
  const set = (i: number, patch: Partial<Goal>) => onChange(goals.map((g, j) => (j === i ? { ...g, ...patch } : g)));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= goals.length) return;
    const next = goals.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <div className="space-y-3">
      {goals.length === 0 && <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted">Целей нет</p>}
      {goals.map((g, i) => (
        <div key={g.id} className="grid gap-3 rounded-2xl border bg-surface-2/40 p-3 sm:grid-cols-[auto_1.5fr_1fr_1fr_auto] sm:items-end">
          <div className="flex gap-1 sm:flex-col">
            <Button type="button" variant="ghost" size="sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Поднять цель «${g.name}» выше`}>
              ↑
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => move(i, 1)} disabled={i === goals.length - 1} aria-label={`Опустить цель «${g.name}» ниже`}>
              ↓
            </Button>
          </div>
          <Field label={`${i + 1}. На что копите`} htmlFor={`${g.id}-n`}>
            <Input id={`${g.id}-n`} value={g.name} maxLength={60} placeholder="Например, отпуск" onChange={(e) => set(i, { name: e.target.value })} />
          </Field>
          <Field label="Сколько нужно" htmlFor={`${g.id}-a`}>
            <NumberInput id={`${g.id}-a`} value={g.amount} min={0} suffix="₽" onChange={(v) => set(i, { amount: v ?? 0 })} />
          </Field>
          <Field label="К какому месяцу" htmlFor={`${g.id}-t`}>
            <NumberInput id={`${g.id}-t`} value={g.targetMonth} allowEmpty min={1} max={Math.max(horizon, 360)} placeholder="без срока" suffix="мес" onChange={(v) => set(i, { targetMonth: v == null ? null : Math.max(1, v) })} />
          </Field>
          <Button type="button" variant="ghost" size="icon" onClick={() => onChange(goals.filter((_, j) => j !== i))} aria-label={`Удалить цель «${g.name}»`}>
            <Trash2 />
          </Button>
        </div>
      ))}
      <Button type="button" variant="secondary" size="sm" disabled={goals.length >= 10} onClick={() => onChange([...goals, { id: uid("goal"), name: "", amount: 30000, targetMonth: null }])}>
        <Plus /> Добавить цель
      </Button>
    </div>
  );
}
