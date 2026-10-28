import { buildDecisionPlan, effectiveFinancing, isPurchaseLike } from "./decision";
import { describeEvent, EVENT_META } from "./meta";
import { eventsForMode, simulateWith } from "./simulate";
import type { Mode, ModelInput, Status, StressEvent } from "./types";

/* ───────────── Торнадо: какой параметр сильнее всего двигает минимальный остаток ───────────── */

export interface SensitivityItem {
  id: string;
  label: string;
  unit: "rub" | "rub_month" | "pct";
  base: number;
  low: { value: number; minBalance: number };
  high: { value: number; minBalance: number };
  /** Разница минимального остатка между «плохим» и «хорошим» краем. */
  spread: number;
}

interface Param {
  id: string;
  label: string;
  unit: SensitivityItem["unit"];
  get: (m: ModelInput) => number;
  set: (m: ModelInput, v: number) => void;
}

function params(model: ModelInput, mode: Mode): Param[] {
  const list: Param[] = [
    { id: "income", label: "Основной доход", unit: "rub_month", get: (m) => m.finances.income, set: (m, v) => void (m.finances.income = v) },
    { id: "extraIncome", label: "Подработка", unit: "rub_month", get: (m) => m.finances.extraIncome, set: (m, v) => void (m.finances.extraIncome = v) },
    { id: "fixed", label: "Обязательные расходы", unit: "rub_month", get: (m) => m.finances.fixedExpenses, set: (m, v) => void (m.finances.fixedExpenses = v) },
    { id: "variable", label: "Переменные расходы", unit: "rub_month", get: (m) => m.finances.variableExpenses, set: (m, v) => void (m.finances.variableExpenses = v) },
    { id: "savings", label: "Накопления", unit: "rub", get: (m) => m.finances.savings, set: (m, v) => void (m.finances.savings = v) },
    { id: "existing", label: "Платежи по кредитам", unit: "rub_month", get: (m) => m.finances.existingPayments, set: (m, v) => void (m.finances.existingPayments = v) },
  ];
  const fin = effectiveFinancing(model);
  if (isPurchaseLike(model))
    list.push({ id: "price", label: model.kind === "loan" ? "Сумма кредита" : "Цена покупки", unit: "rub", get: (m) => m.decision.price, set: (m, v) => void (m.decision.price = v) });
  if (fin === "installment" && model.decision.installment.monthlyPayment != null)
    list.push({ id: "payment", label: "Платёж по рассрочке", unit: "rub_month", get: (m) => m.decision.installment.monthlyPayment ?? 0, set: (m, v) => void (m.decision.installment.monthlyPayment = v) });
  if (fin === "loan" && model.decision.loan.annualRate > 0)
    list.push({ id: "rate", label: "Ставка по кредиту", unit: "pct", get: (m) => m.decision.loan.annualRate, set: (m, v) => void (m.decision.loan.annualRate = Math.min(100, v)) });
  if ((model.kind === "relocation" || model.kind === "custom") && model.decision.monthlyCostDelta > 0)
    list.push({ id: "costDelta", label: "Рост расходов после решения", unit: "rub_month", get: (m) => m.decision.monthlyCostDelta, set: (m, v) => void (m.decision.monthlyCostDelta = v) });
  if (model.decision.oneTimeCost > 0)
    list.push({ id: "oneTime", label: "Разовые траты", unit: "rub", get: (m) => m.decision.oneTimeCost, set: (m, v) => void (m.decision.oneTimeCost = v) });
  for (const e of eventsForMode(model.events, mode)) {
    if (e.type === "income_delay") continue;
    const idx = model.events.findIndex((x) => x.id === e.id);
    const unit = EVENT_META[e.type].unit === "%" ? "pct" : EVENT_META[e.type].unit === "₽" ? "rub" : "rub_month";
    list.push({
      id: `event-${e.id}`,
      label: describeEvent(e),
      unit,
      get: (m) => m.events[idx].value,
      set: (m, v) => void (m.events[idx].value = unit === "pct" ? Math.min(100, v) : v),
    });
  }
  return list.filter((p) => p.get(model) > 0);
}

/** Сценарный анализ чувствительности: каждый параметр по отдельности сдвигается на ±pct% при прочих равных. */
export function tornado(model: ModelInput, mode: Mode, pct = 20): SensitivityItem[] {
  const run = (m: ModelInput) => simulateWith(m, eventsForMode(m.events, mode)).metrics.minBalance;
  return params(model, mode)
    .map((p) => {
      const base = p.get(model);
      const at = (v: number) => {
        const m = structuredClone(model);
        p.set(m, v);
        return run(m);
      };
      const lowV = base * (1 - pct / 100);
      const highV = base * (1 + pct / 100);
      const a = { value: lowV, minBalance: at(lowV) };
      const b = { value: highV, minBalance: at(highV) };
      return { id: p.id, label: p.label, unit: p.unit, base, low: a, high: b, spread: Math.abs(a.minBalance - b.minBalance) };
    })
    .sort((x, y) => y.spread - x.spread);
}

/* ───────────── Карта устойчивости: статус по сетке из двух параметров ───────────── */

export type AxisId = "income_drop" | "extra_expense" | "price" | "payment" | "start_month" | "savings" | "reserve";

export interface AxisOption {
  id: AxisId;
  label: string;
  unit: "pct" | "rub" | "rub_month" | "month";
  min: number;
  max: number;
  current: number;
  integer?: boolean;
}

const synthetic = (type: StressEvent["type"], value: number, month: number, duration: number): StressEvent => ({
  id: `__map_${type}`,
  type,
  value,
  month,
  duration,
  enabled: true,
  tier: "stress",
  probability: null,
});

export function axisOptions(model: ModelInput): AxisOption[] {
  const f = model.finances;
  const plan = buildDecisionPlan(model);
  const opts: AxisOption[] = [
    { id: "income_drop", label: "На сколько упал доход", unit: "pct", min: 0, max: 60, current: 0 },
    { id: "extra_expense", label: "Разовая трата в 1-м месяце", unit: "rub", min: 0, max: Math.max(50000, Math.round((f.savings + f.income * 2) / 1000) * 1000), current: 0 },
    { id: "savings", label: "Накопления", unit: "rub", min: 0, max: Math.max(100000, f.savings * 2), current: f.savings },
    { id: "reserve", label: "Запас", unit: "rub", min: 0, max: Math.max(50000, f.minReserve * 3), current: f.minReserve },
  ];
  if (isPurchaseLike(model)) opts.push({ id: "price", label: model.kind === "loan" ? "Сумма кредита" : "Цена покупки", unit: "rub", min: 0, max: Math.max(model.decision.price * 2, 10000), current: model.decision.price });
  if (plan.monthlyPayment != null) opts.push({ id: "payment", label: "Платёж в месяц", unit: "rub_month", min: 0, max: Math.max(plan.monthlyPayment * 2.5, 10000), current: plan.monthlyPayment });
  if (model.kind !== "cushion") opts.push({ id: "start_month", label: "Месяц решения", unit: "month", min: 1, max: model.horizon, current: model.decision.startMonth, integer: true });
  return opts;
}

/** Применяет значение оси к копии модели; возвращает модель и дополнительные синтетические события. */
function applyAxis(model: ModelInput, axis: AxisId, v: number): { model: ModelInput; extra: StressEvent[]; paymentOverride?: number } {
  const m = structuredClone(model);
  switch (axis) {
    case "income_drop":
      return { model: m, extra: [synthetic("income_drop", v, 1, m.horizon)] };
    case "extra_expense":
      return { model: m, extra: [synthetic("unexpected_expense", v, 1, 1)] };
    case "savings":
      m.finances.savings = v;
      break;
    case "reserve":
      m.finances.minReserve = v;
      break;
    case "price":
      m.decision.price = v;
      m.decision.downPayment = Math.min(m.decision.downPayment, v);
      if (m.decision.installment.monthlyPayment != null) m.decision.installment.monthlyPayment = null;
      if (m.decision.loan.monthlyPayment != null) m.decision.loan.monthlyPayment = null;
      break;
    case "payment":
      return { model: m, extra: [], paymentOverride: v };
    case "start_month":
      m.decision.startMonth = Math.max(1, Math.round(v));
      break;
  }
  return { model: m, extra: [] };
}

export interface StabilityCell {
  x: number;
  y: number;
  minBalance: number;
  status: Status;
  firstBreach: number | null;
}

export interface StabilityMap {
  x: AxisOption;
  y: AxisOption;
  xs: number[];
  ys: number[];
  cells: StabilityCell[][];
  /** Доля клеток, где резерв сохраняется. */
  safeShare: number;
}

const grid = (a: AxisOption, steps: number) => {
  if (a.integer) {
    const n = Math.min(steps, a.max - a.min + 1);
    return Array.from({ length: n }, (_, i) => Math.round(a.min + ((a.max - a.min) * i) / Math.max(1, n - 1)));
  }
  return Array.from({ length: steps }, (_, i) => a.min + ((a.max - a.min) * i) / (steps - 1));
};

export function stabilityMap(model: ModelInput, mode: Mode, xId: AxisId, yId: AxisId, steps = 11): StabilityMap {
  const opts = axisOptions(model);
  const x = opts.find((o) => o.id === xId) ?? opts[0];
  const y = opts.find((o) => o.id === yId) ?? opts[1];
  const xs = grid(x, steps);
  const ys = grid(y, steps);
  let safe = 0;
  const cells = ys.map((yv) =>
    xs.map((xv) => {
      const ax = applyAxis(model, x.id, xv);
      const ay = applyAxis(ax.model, y.id, yv);
      const m = ay.model;
      const plan = buildDecisionPlan(m);
      const override = ay.paymentOverride ?? ax.paymentOverride;
      const label = effectiveFinancing(m) === "loan" ? "Платёж по кредиту" : "Платёж по рассрочке";
      const p = override != null ? { ...plan, flows: plan.flows.map((fl) => (fl.label === label ? { ...fl, amounts: fl.amounts.map(() => override) } : fl)) } : plan;
      const r = simulateWith(m, [...eventsForMode(m.events, mode), ...ax.extra, ...ay.extra], p);
      if (r.metrics.status === "ok") safe++;
      return { x: xv, y: yv, minBalance: r.metrics.minBalance, status: r.metrics.status, firstBreach: r.metrics.firstReserveBreachMonth };
    }),
  );
  return { x, y, xs, ys, cells, safeShare: safe / (xs.length * ys.length) };
}
