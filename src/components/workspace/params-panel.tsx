"use client";

import { useState } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { describeEvent, effectiveFinancing, EVENT_META, isPurchaseLike, resolveSettings, type ModelInput, type ModelSettings } from "@/lib/engine";
import { NumberInput, Segmented, Switch } from "@/components/ui/primitives";
import { formatRub, pluralMonths } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useWorkspace } from "./context";

function SliderField({
  label,
  value,
  min,
  max,
  step,
  suffix = "₽",
  onChange,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (v: number) => void;
  hint?: string;
}) {
  const id = `p-${label.replace(/\s+/g, "-")}`;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-xs font-medium text-muted">
          {label}
        </label>
        <NumberInput value={value} onChange={(v) => onChange(Math.max(min, v ?? 0))} suffix={suffix} className="w-36" aria-describedby={id} min={min} />
      </div>
      <input id={id} type="range" min={min} max={Math.max(max, value)} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      {hint && <p className="text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

const ceil = (x: number, s: number) => Math.ceil(x / s) * s;

/** Расширенные допущения: инфляция, индексация, доходность остатка, дневная модель месяца. */
export function AdvancedSettings({ model, upd }: { model: ModelInput; upd: (fn: (m: ModelInput) => void) => void }) {
  const s = resolveSettings(model.settings);
  const set = (patch: Partial<ModelSettings>) => upd((m) => void (m.settings = { ...resolveSettings(m.settings), ...patch }));
  const active = s.inflationPct !== 0 || s.incomeIndexPct !== 0 || s.savingsRatePct !== 0 || s.cashTiming === "payday" || s.incomeVarPct > 0 || s.expenseVarPct > 0;
  return (
    <details className="group border-t pt-5" open={active}>
      <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-medium text-muted hover:text-fg">
        <ChevronDown className="size-3.5 transition group-open:rotate-180" /> Точнее: инфляция, разброс, проценты, дни
        {active && <span className="ml-auto rounded-full bg-violet/10 px-2 py-0.5 text-[10px] text-violet">включено</span>}
      </summary>
      <div className="mt-4 space-y-5">
        <SliderField label="Цены растут за год на" value={s.inflationPct} min={0} max={30} step={0.5} suffix="%" onChange={(v) => set({ inflationPct: Math.min(100, v) })} />
        <SliderField label="Зарплата растёт за год на" value={s.incomeIndexPct} min={0} max={30} step={0.5} suffix="%" onChange={(v) => set({ incomeIndexPct: Math.min(100, v) })} />
        <SliderField label="Доход может плавать на ±" value={s.incomeVarPct} min={0} max={50} step={1} suffix="%" onChange={(v) => set({ incomeVarPct: Math.min(50, v) })} />
        <SliderField label="Расходы могут плавать на ±" value={s.expenseVarPct} min={0} max={50} step={1} suffix="%" onChange={(v) => set({ expenseVarPct: Math.min(50, v) })} />
        <SliderField label="Процент по вкладу, в год" value={s.savingsRatePct} min={0} max={25} step={0.5} suffix="%" onChange={(v) => set({ savingsRatePct: Math.min(100, v) })} />
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted">Как считать</p>
          <Segmented
            size="sm"
            label="Как считать"
            value={s.cashTiming}
            onChange={(v) => set({ cashTiming: v })}
            options={[
              { value: "month", label: "По месяцам" },
              { value: "payday", label: "По дням" },
            ]}
          />
          {s.cashTiming === "payday" && (
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1 text-[11px] text-muted">
                День зарплаты
                <NumberInput value={s.payday} min={1} max={28} onChange={(v) => set({ payday: Math.min(28, Math.max(1, v ?? 1)) })} />
              </label>
              <label className="space-y-1 text-[11px] text-muted">
                День платежей
                <NumberInput value={s.paymentDay} min={1} max={28} onChange={(v) => set({ paymentDay: Math.min(28, Math.max(1, v ?? 1)) })} />
              </label>
            </div>
          )}
        </div>
      </div>
    </details>
  );
}

export function ParamsPanel() {
  const { model, setModel, result } = useWorkspace();
  const [open, setOpen] = useState(false);
  const f = model.finances;
  const d = model.decision;
  const fin = effectiveFinancing(model);
  const plan = result.plan;

  const upd = (fn: (m: ModelInput) => void) => {
    const next = structuredClone(model);
    fn(next);
    setModel(next);
  };

  return (
    <section className="card overflow-hidden" aria-label="Параметры сценария">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-2 p-4 text-left lg:pointer-events-none">
        <SlidersHorizontal className="size-4 text-accent" />
        <span className="font-semibold">Параметры</span>
        <ChevronDown className={cn("ml-auto size-4 transition lg:hidden", open && "rotate-180")} />
      </button>
      <div className={cn("space-y-5 border-t p-4", !open && "hidden lg:block")}>
        <SliderField label="Зарплата в месяц" value={f.income} min={0} max={ceil(Math.max(200000, f.income * 2), 10000)} step={1000} onChange={(v) => upd((m) => void (m.finances.income = v))} />
        <SliderField label="Обязательные расходы" value={f.fixedExpenses} min={0} max={ceil(Math.max(150000, f.fixedExpenses * 2), 10000)} step={500} onChange={(v) => upd((m) => void (m.finances.fixedExpenses = v))} />
        <SliderField label="Расходы на жизнь" value={f.variableExpenses} min={0} max={ceil(Math.max(100000, f.variableExpenses * 2), 10000)} step={500} onChange={(v) => upd((m) => void (m.finances.variableExpenses = v))} />
        <SliderField label="Накопления" value={f.savings} min={0} max={ceil(Math.max(300000, f.savings * 2), 10000)} step={1000} onChange={(v) => upd((m) => void (m.finances.savings = v))} />
        <SliderField label="Запас, который не трогаем" value={f.minReserve} min={0} max={ceil(Math.max(100000, f.minReserve * 2), 10000)} step={1000} onChange={(v) => upd((m) => void (m.finances.minReserve = v))} />

        {(f.debts ?? []).length > 0 && (
          <div className="space-y-5 border-t pt-5">
            <p className="text-xs font-medium text-muted">Кредиты и рассрочки</p>
            {(f.debts ?? []).map((debt, i) => (
              <SliderField
                key={debt.id}
                label={`${debt.name || "Платёж"}${debt.monthsLeft > 0 ? ` (ещё ${debt.monthsLeft} мес.)` : ""}`}
                value={debt.monthlyPayment}
                min={0}
                max={ceil(Math.max(debt.monthlyPayment * 2, 20000), 1000)}
                step={500}
                suffix="₽/мес"
                onChange={(v) => upd((m) => void (m.finances.debts![i].monthlyPayment = v))}
              />
            ))}
          </div>
        )}

        {isPurchaseLike(model) && (
          <div className="space-y-5 border-t pt-5">
            <SliderField label={model.kind === "loan" ? "Сумма кредита" : "Цена"} value={d.price} min={0} max={ceil(Math.max(d.price * 2, 100000), 10000)} step={1000} onChange={(v) => upd((m) => void (m.decision.price = v))} />
            {fin !== "cash" && model.kind !== "loan" && (
              <SliderField label="Первый взнос" value={d.downPayment} min={0} max={d.price} step={1000} onChange={(v) => upd((m) => void (m.decision.downPayment = Math.min(v, m.decision.price)))} />
            )}
            {fin === "installment" && (
              <SliderField
                label="Платёж в месяц"
                value={d.installment.monthlyPayment ?? plan.monthlyPayment ?? 0}
                min={0}
                max={ceil(Math.max((plan.monthlyPayment ?? 0) * 3, 30000), 1000)}
                step={500}
                suffix="₽/мес"
                onChange={(v) => upd((m) => void (m.decision.installment.monthlyPayment = v))}
              />
            )}
            {fin === "installment" && <SliderField label="Срок рассрочки, месяцев" value={d.installment.months} min={1} max={36} step={1} suffix="мес" onChange={(v) => upd((m) => void (m.decision.installment.months = Math.max(1, v)))} />}
            {fin === "loan" && <SliderField label="Ставка" value={d.loan.annualRate} min={0} max={60} step={0.5} suffix="%" onChange={(v) => upd((m) => void (m.decision.loan.annualRate = Math.min(100, v)))} />}
            {fin === "loan" && <SliderField label="Срок кредита, месяцев" value={d.loan.months} min={1} max={120} step={1} suffix="мес" onChange={(v) => upd((m) => void (m.decision.loan.months = Math.max(1, v)))} />}
            {fin === "loan" && plan.monthlyPayment != null && (
              <p className="text-xs text-muted">
                Платёж: <span className="num font-semibold text-fg">{formatRub(plan.monthlyPayment)}</span>/мес
              </p>
            )}
          </div>
        )}

        {model.kind !== "cushion" && (
          <div className="border-t pt-5">
            <SliderField
              label="В каком месяце"
              value={d.startMonth}
              min={1}
              max={model.horizon}
              step={1}
              suffix="мес"
              hint={d.startMonth > 1 ? `Откладываете на ${pluralMonths(d.startMonth - 1)}` : "Прямо сейчас"}
              onChange={(v) => upd((m) => void (m.decision.startMonth = Math.max(1, v)))}
            />
          </div>
        )}
        {(model.kind === "relocation" || model.kind === "custom") && (
          <SliderField label="Расходы вырастут на" value={d.monthlyCostDelta} min={0} max={ceil(Math.max(50000, d.monthlyCostDelta * 2), 5000)} step={500} suffix="₽/мес" onChange={(v) => upd((m) => void (m.decision.monthlyCostDelta = v))} />
        )}
        {model.kind === "income_change" && (
          <SliderField label="Месяцев без зарплаты" value={d.incomeGapMonths} min={0} max={model.horizon} step={1} suffix="мес" onChange={(v) => upd((m) => void (m.decision.incomeGapMonths = v))} />
        )}

        <div className="border-t pt-5">
          <SliderField label="Считаем вперёд на" value={model.horizon} min={1} max={60} step={1} suffix="мес" onChange={(v) => upd((m) => void (m.horizon = Math.min(60, Math.max(1, v))))} />
        </div>

        <AdvancedSettings model={model} upd={upd} />

        <div className="space-y-3 border-t pt-5">
          <p className="text-xs font-medium text-muted">Что может пойти не так</p>
          {model.events.length === 0 && <p className="text-xs text-muted">Нет событий</p>}
          {model.events.map((e, i) => (
            <div key={e.id} className="space-y-2 rounded-xl bg-surface-2/50 p-3">
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={e.enabled} onCheckedChange={(v) => upd((m) => void (m.events[i].enabled = v))} aria-label={`Событие «${EVENT_META[e.type].label}»`} />
                <span className="min-w-0 flex-1 truncate">{describeEvent(e)}</span>
              </label>
              <input
                type="range"
                aria-label={EVENT_META[e.type].valueLabel}
                min={0}
                max={EVENT_META[e.type].unit === "%" ? 100 : e.type === "income_delay" ? model.horizon : ceil(Math.max(e.value * 3, 30000), 1000)}
                step={EVENT_META[e.type].unit === "%" || e.type === "income_delay" ? 1 : 500}
                value={e.value}
                disabled={!e.enabled}
                onChange={(ev) => upd((m) => void (m.events[i].value = Number(ev.target.value)))}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
