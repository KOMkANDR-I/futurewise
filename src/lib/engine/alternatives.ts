import { buildDecisionPlan, effectiveFinancing, isPurchaseLike } from "./decision";
import { simulate } from "./simulate";
import { formatRub, pluralMonths } from "../format";
import type { DecisionPlan, Mode, ModelInput, SimulationResult } from "./types";

export interface Alternative {
  id: string;
  title: string;
  description: string;
  changes: string[];
  model: ModelInput;
  available: boolean;
  unavailableReason?: string;
}

export interface AlternativeResult {
  alt: Alternative;
  plan: DecisionPlan;
  modes: Record<Mode, SimulationResult>;
  summary: {
    totalCost: number;
    overpayment: number;
    monthlyPayment: number | null;
    acquireMonth: number | null;
    acquiredInHorizon: boolean;
    paidInHorizon: number;
    minBalance: Record<Mode, number>;
    firstDeficit: Record<Mode, number | null>;
    firstBreach: Record<Mode, number | null>;
    reserveOkAllModes: boolean;
  };
}

const clone = (model: ModelInput): ModelInput => structuredClone(model);

/** Самый ранний месяц исполнения решения, при котором резерв сохраняется в заданном режиме (перебор по месяцам). */
export function earliestSafeStart(model: ModelInput, mode: Mode = "stress"): number | null {
  for (let m = model.decision.startMonth; m <= model.horizon; m++) {
    const alt = clone(model);
    alt.decision.startMonth = m;
    const r = simulate(alt, mode);
    if (r.metrics.minBalance >= model.finances.minReserve) return m;
  }
  return null;
}

/**
 * Альтернативы строятся как копии модели с одним изменением.
 * Исходный сценарий не изменяется; горизонт и события у всех вариантов одинаковые.
 */
export function generateAlternatives(model: ModelInput): Alternative[] {
  const d = model.decision;
  const fin = effectiveFinancing(model);
  const alts: Alternative[] = [
    { id: "original", title: "Как задумано", description: "Ваше решение без изменений.", changes: [], model: clone(model), available: true },
  ];

  if (isPurchaseLike(model)) {
    const cheaper = clone(model);
    cheaper.decision.price = Math.round(d.price * 0.75);
    cheaper.decision.downPayment = Math.min(d.downPayment, cheaper.decision.price);
    if (fin === "installment" && d.installment.monthlyPayment != null) cheaper.decision.installment.monthlyPayment = Math.round(d.installment.monthlyPayment * 0.75);
    if (fin === "loan" && d.loan.monthlyPayment != null) cheaper.decision.loan.monthlyPayment = null;
    alts.push({
      id: "cheaper",
      title: model.kind === "loan" ? "Кредит поменьше" : "Вариант подешевле",
      description: model.kind === "loan" ? "Берёте в кредит на 25% меньше." : "Покупка на 25% дешевле, платите так же.",
      changes: [`${model.kind === "loan" ? "Сумма" : "Цена"}: ${formatRub(d.price)} → ${formatRub(cheaper.decision.price)}`],
      model: cheaper,
      available: true,
    });

    if (fin === "installment" || (fin === "loan" && model.kind !== "loan")) {
      const bigger = clone(model);
      const add = Math.round(d.price * 0.2);
      bigger.decision.downPayment = Math.min(d.price, d.downPayment + add);
      if (fin === "installment") bigger.decision.installment.monthlyPayment = null;
      else bigger.decision.loan.monthlyPayment = null;
      alts.push({
        id: "bigger_down",
        title: "Внести больше сразу",
        description: "Первый взнос больше на 20% от цены, платёж пересчитан.",
        changes: [`Взнос: ${formatRub(d.downPayment)} → ${formatRub(bigger.decision.downPayment)}`, "Платёж пересчитан"],
        model: bigger,
        available: d.downPayment < d.price,
        unavailableReason: "Взнос уже равен полной цене.",
      });
    }

    if (fin === "installment" || fin === "loan") {
      const longer = clone(model);
      const n0 = fin === "installment" ? d.installment.months : d.loan.months;
      const n1 = Math.max(n0 + 1, Math.round(n0 * 1.5));
      if (fin === "installment") {
        longer.decision.installment.months = n1;
        if (d.installment.monthlyPayment != null) longer.decision.installment.monthlyPayment = Math.round((d.installment.monthlyPayment * n0) / n1);
      } else {
        longer.decision.loan.months = n1;
        longer.decision.loan.monthlyPayment = null;
      }
      alts.push({
        id: "lower_payment",
        title: "Платёж поменьше",
        description: fin === "loan" ? "Срок дольше: в месяц платить меньше, но переплата по процентам больше." : "Рассрочка на более долгий срок — если магазин так предлагает.",
        changes: [`Срок: ${pluralMonths(n0)} → ${pluralMonths(n1)}`],
        model: longer,
        available: true,
      });
    }
  }

  if (model.kind !== "cushion") {
    const later = clone(model);
    later.decision.startMonth = d.startMonth + 3;
    alts.push({
      id: "defer",
      title: "Подождать 3 месяца",
      description: "То же самое, но на 3 месяца позже. Пока деньги остаются у вас.",
      changes: [`Когда: ${d.startMonth}-й → ${later.decision.startMonth}-й месяц`],
      model: later,
      available: later.decision.startMonth <= model.horizon,
      unavailableReason: "Если подождать, решение выйдет за срок расчёта.",
    });

    const safe = earliestSafeStart(model, "stress");
    const reserveFirst = clone(model);
    if (safe != null) reserveFirst.decision.startMonth = safe;
    alts.push({
      id: "reserve_first",
      title: "Сначала накопить запас",
      description: "Самый ранний месяц, когда запас останется цел даже в кризисном случае.",
      changes: safe != null ? [`Когда: ${d.startMonth}-й → ${safe}-й месяц`] : [],
      model: reserveFirst,
      available: safe != null && safe > d.startMonth,
      unavailableReason:
        safe == null
          ? `За ${pluralMonths(model.horizon)} нет такого месяца, когда запас останется цел даже в кризисном случае.`
          : "Запас и так цел — копить заранее не нужно.",
    });
  }

  if (model.kind === "relocation" || model.kind === "custom" || model.kind === "income_change") {
    const lighter = clone(model);
    lighter.decision.oneTimeCost = Math.round(d.oneTimeCost * 0.75);
    lighter.decision.monthlyCostDelta = d.monthlyCostDelta > 0 ? Math.round(d.monthlyCostDelta * 0.75) : d.monthlyCostDelta;
    lighter.decision.incomeGapMonths = Math.floor(d.incomeGapMonths / 2);
    const changes: string[] = [];
    if (d.oneTimeCost > 0) changes.push(`Разовые траты: ${formatRub(d.oneTimeCost)} → ${formatRub(lighter.decision.oneTimeCost)}`);
    if (d.monthlyCostDelta > 0) changes.push(`Рост расходов: ${formatRub(d.monthlyCostDelta)} → ${formatRub(lighter.decision.monthlyCostDelta)} в месяц`);
    if (d.incomeGapMonths > 0) changes.push(`Без зарплаты: ${pluralMonths(d.incomeGapMonths)} → ${pluralMonths(lighter.decision.incomeGapMonths)}`);
    alts.push({
      id: "lighter",
      title: "Вариант попроще",
      description: "Траты на 25% меньше, перерыв без зарплаты вдвое короче.",
      changes,
      model: lighter,
      available: changes.length > 0,
      unavailableReason: "Здесь нечего уменьшать.",
    });
  }

  if (model.finances.variableExpenses > 0) {
    const thrifty = clone(model);
    thrifty.finances.variableExpenses = Math.round(model.finances.variableExpenses * 0.9);
    alts.push({
      id: "cut_variable",
      title: "Тратить на 10% меньше",
      description: "Решение то же, но повседневные траты на 10% меньше.",
      changes: [`Повседневные траты: ${formatRub(model.finances.variableExpenses)} → ${formatRub(thrifty.finances.variableExpenses)} в месяц`],
      model: thrifty,
      available: true,
    });
  }

  return alts;
}

export function evaluateAlternative(alt: Alternative): AlternativeResult {
  const plan = buildDecisionPlan(alt.model);
  const modes = {
    base: simulate(alt.model, "base", plan),
    adverse: simulate(alt.model, "adverse", plan),
    stress: simulate(alt.model, "stress", plan),
  };
  const reserve = alt.model.finances.minReserve;
  const byMode = <T,>(f: (r: SimulationResult) => T) => ({ base: f(modes.base), adverse: f(modes.adverse), stress: f(modes.stress) });
  return {
    alt,
    plan,
    modes,
    summary: {
      totalCost: plan.totalCost,
      overpayment: plan.overpayment,
      monthlyPayment: plan.monthlyPayment,
      acquireMonth: plan.acquireMonth,
      acquiredInHorizon: plan.acquireMonth != null && plan.acquireMonth <= alt.model.horizon,
      paidInHorizon: modes.base.metrics.decisionPaidInHorizon,
      minBalance: byMode((r) => r.metrics.minBalance),
      firstDeficit: byMode((r) => r.metrics.firstDeficitMonth),
      firstBreach: byMode((r) => r.metrics.firstReserveBreachMonth),
      reserveOkAllModes: (["base", "adverse", "stress"] as Mode[]).every((m) => modes[m].metrics.minBalance >= reserve),
    },
  };
}

export function compareAlternatives(model: ModelInput) {
  const results = generateAlternatives(model).map(evaluateAlternative);
  return { results, tradeoffs: describeTradeoffs(results) };
}

/** Текстовые компромиссы строятся только из рассчитанных значений; один «лучший» вариант не выбирается. */
export function describeTradeoffs(results: AlternativeResult[]): string[] {
  const avail = results.filter((r) => r.alt.available);
  if (avail.length < 2) return [];
  const out: string[] = [];
  const by = <K,>(arr: AlternativeResult[], f: (r: AlternativeResult) => number) => arr.reduce((a, b) => (f(b) < f(a) ? b : a));
  const safest = by(avail, (r) => -r.summary.minBalance.stress);
  out.push(`Больше всего денег остаётся в кризисном случае у варианта «${safest.alt.title}»: в самый трудный момент — ${formatRub(safest.summary.minBalance.stress)}.`);
  const withCost = avail.filter((r) => r.summary.totalCost > 0);
  if (withCost.length > 1) {
    const cheapest = by(withCost, (r) => r.summary.totalCost);
    out.push(`Дешевле всего обойдётся «${cheapest.alt.title}»: ${formatRub(cheapest.summary.totalCost)}${cheapest.summary.overpayment > 0 ? `, из них переплата ${formatRub(cheapest.summary.overpayment)}` : ""}.`);
  }
  const acquired = avail.filter((r) => r.summary.acquiredInHorizon);
  if (acquired.length > 1) {
    const earliest = by(acquired, (r) => r.summary.acquireMonth ?? Infinity);
    const latest = by(acquired, (r) => -(r.summary.acquireMonth ?? 0));
    if (earliest.summary.acquireMonth !== latest.summary.acquireMonth)
      out.push(`Быстрее всего вы получите желаемое в варианте «${earliest.alt.title}» (${earliest.summary.acquireMonth}-й месяц), позже всего — в варианте «${latest.alt.title}» (${latest.summary.acquireMonth}-й месяц).`);
  }
  const ok = avail.filter((r) => r.summary.reserveOkAllModes);
  out.push(
    ok.length
      ? `Запас цел во всех трёх сценариях у вариантов: ${ok.map((r) => `«${r.alt.title}»`).join(", ")}.`
      : "Ни один вариант не сохраняет запас во всех трёх сценариях. Попробуйте изменить параметры сильнее или уменьшить запас.",
  );
  const lp = avail.find((r) => r.alt.id === "lower_payment");
  const orig = avail.find((r) => r.alt.id === "original");
  if (lp && orig && lp.summary.overpayment > orig.summary.overpayment + 1)
    out.push(`Если снизить платёж за счёт срока, переплата вырастет на ${formatRub(lp.summary.overpayment - orig.summary.overpayment)}.`);
  return out;
}
