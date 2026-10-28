import { buildDecisionPlan, effectiveFinancing, isPurchaseLike } from "./decision";
import { MODE_META } from "./meta";
import { eventsForMode, simulateWith } from "./simulate";
import { formatRub, fromMonth, inMonth, pluralMonths } from "../format";
import type { DecisionPlan, Metrics, Mode, ModelInput, SimulationResult, StressEvent } from "./types";

export type Criterion = "reserve" | "zero";
export type BreakpointUnit = "pct" | "rub" | "rub_month" | "month" | "months";

export interface Breakpoint {
  id: string;
  title: string;
  question: string;
  unit: BreakpointUnit;
  /** Текущее значение параметра в сценарии. */
  current: number | null;
  /** Пороговое значение: последнее значение, при котором условие ещё выполняется (для «минимальных» — первое выполняющее). */
  threshold: number | null;
  /** found — порог найден; holds_all — условие выполняется во всём диапазоне поиска; broken — не выполняется даже в лучшей точке. */
  status: "found" | "holds_all" | "broken";
  direction: "max" | "min";
  method: "binary" | "scan" | "direct";
  step: number;
  range: [number, number];
  /** Результат на пороге (условие выполняется). */
  before: Metrics | null;
  /** Результат сразу после пересечения порога (условие нарушено). */
  after: Metrics | null;
  assumptions: string[];
}

export interface BreakpointOptions {
  mode: Mode;
  criterion: Criterion;
  /** Месяц, в котором проверяется разовый дополнительный расход. */
  expenseMonth?: number;
}

const passes = (r: SimulationResult, c: Criterion, reserve: number) => r.metrics.minBalance >= (c === "reserve" ? reserve : 0);

const synthetic = (type: StressEvent["type"], value: number, month: number, duration: number): StressEvent => ({
  id: "__breakpoint",
  type,
  value,
  month,
  duration,
  enabled: true,
  tier: "stress",
  probability: null,
});

/** Копия модели с изменённым решением — исходный объект не меняется. */
function withDecision(model: ModelInput, patch: (d: ModelInput["decision"]) => ModelInput["decision"]): ModelInput {
  const decision = patch(structuredClone(model.decision));
  return { ...model, decision };
}

/**
 * Бинарный поиск максимального x на [lo, hi], при котором ok(x) истинно.
 * Корректен для монотонных зависимостей: ok(x) = true, затем false.
 */
function bisectMax(lo: number, hi: number, step: number, ok: (x: number) => boolean) {
  if (!ok(lo)) return { status: "broken" as const, threshold: null };
  if (ok(hi)) return { status: "holds_all" as const, threshold: hi };
  let a = lo;
  let b = hi;
  for (let i = 0; i < 80 && b - a > step / 4; i++) {
    const mid = (a + b) / 2;
    if (ok(mid)) a = mid;
    else b = mid;
  }
  let t = Math.floor(a / step) * step;
  // Уточнение на сетке шага: t выполняет условие, t + step — уже нет.
  while (t + step <= hi && ok(t + step)) t += step;
  while (t > lo && !ok(t)) t -= step;
  return { status: "found" as const, threshold: Math.max(lo, Number(t.toFixed(6))) };
}

export function findBreakpoints(model: ModelInput, opts: BreakpointOptions): Breakpoint[] {
  const { mode, criterion } = opts;
  const H = model.horizon;
  const reserve = model.finances.minReserve;
  const modeEvents = eventsForMode(model.events, mode);
  const criterionText = criterion === "reserve" ? `денег не меньше вашего запаса (${formatRub(reserve)})` : "баланс не уходит в минус";
  const common = [
    `Сценарий: ${MODE_META[mode].label.toLowerCase()} (${MODE_META[mode].phrase}). Проверяем, что ${criterionText}, на ${pluralMonths(H)} вперёд.`,
    "Всё остальное в расчёте не меняем.",
  ];
  const run = (m: ModelInput, extra: StressEvent[] = [], plan?: DecisionPlan) => simulateWith(m, [...modeEvents, ...extra], plan);
  const ok = (r: SimulationResult) => passes(r, criterion, reserve);
  const result: Breakpoint[] = [];

  // 1. Максимальное снижение основного дохода.
  if (model.finances.income > 0) {
    const plan = buildDecisionPlan(model);
    const sim = (x: number) => run(model, [synthetic("income_drop", x, 1, H)], plan);
    const s = bisectMax(0, 100, 0.1, (x) => ok(sim(x)));
    result.push({
      id: "income_drop",
      title: "Насколько может упасть доход",
      question: "На сколько процентов может упасть зарплата, чтобы вы всё ещё справлялись?",
      unit: "pct",
      current: 0,
      threshold: s.threshold,
      status: s.status,
      direction: "max",
      method: "binary",
      step: 0.1,
      range: [0, 100],
      before: s.threshold != null ? sim(s.threshold).metrics : null,
      after: s.status === "found" ? sim(Math.min(100, s.threshold! + 0.1)).metrics : s.status === "broken" ? sim(0).metrics : null,
      assumptions: [...common, "Доход падает с 1-го месяца и до конца расчёта — вдобавок к событиям сценария."],
    });
  }

  // 2. Максимальный разовый дополнительный расход.
  {
    const month = Math.min(H, Math.max(1, opts.expenseMonth ?? 1));
    const plan = buildDecisionPlan(model);
    const sim = (x: number) => run(model, [synthetic("unexpected_expense", x, month, 1)], plan);
    const hi = Math.max(1000, model.finances.savings + (model.finances.income + model.finances.extraIncome) * H + 1);
    const s = bisectMax(0, hi, 100, (x) => ok(sim(x)));
    result.push({
      id: "extra_expense",
      title: "Какую непредвиденную трату вы выдержите",
      question: `Какую разовую трату ${inMonth(month)} вы переживёте без проблем?`,
      unit: "rub",
      current: 0,
      threshold: s.threshold,
      status: s.status,
      direction: "max",
      method: "binary",
      step: 100,
      range: [0, hi],
      before: s.threshold != null ? sim(s.threshold).metrics : null,
      after: s.status === "found" ? sim(s.threshold! + 100).metrics : s.status === "broken" ? sim(0).metrics : null,
      assumptions: [
        ...common,
        `Трата случается один раз ${inMonth(month)}.${month === 1 ? " Это самый строгий вариант: такая трата влияет на все следующие месяцы." : ""}`,
        "Ищем с точностью до 100 ₽.",
      ],
    });
  }

  // 3. Максимальный ежемесячный платёж.
  {
    const basePlan = buildDecisionPlan(model);
    const financed = basePlan.monthlyPayment != null && basePlan.termMonths != null && basePlan.firstPaymentMonth != null;
    const label = financed ? (effectiveFinancing(model) === "loan" ? "Платёж по кредиту" : "Платёж по рассрочке") : null;
    const simFor = (x: number) => {
      if (financed && label) {
        const plan: DecisionPlan = {
          ...basePlan,
          flows: basePlan.flows.map((fl) => (fl.label === label ? { ...fl, amounts: fl.amounts.map(() => x) } : fl)),
        };
        return run(model, [], plan);
      }
      return run(model, [synthetic("new_payment", x, 1, H)], basePlan);
    };
    const hi = Math.max(1000, model.finances.income + model.finances.extraIncome + model.finances.savings);
    const s = bisectMax(0, hi, 100, (x) => ok(simFor(x)));
    result.push({
      id: "max_payment",
      title: financed ? "Какой платёж вы потянете" : "Какой новый ежемесячный платёж вы потянете",
      question: financed
        ? `Какой платёж в месяц вы ещё потянете при том же сроке — ${pluralMonths(basePlan.termMonths ?? 0)}?`
        : "Какой новый обязательный платёж в месяц вы потянете на всём сроке расчёта?",
      unit: "rub_month",
      current: financed ? basePlan.monthlyPayment : 0,
      threshold: s.threshold,
      status: s.status,
      direction: "max",
      method: "binary",
      step: 100,
      range: [0, hi],
      before: s.threshold != null ? simFor(s.threshold).metrics : null,
      after: s.status === "found" ? simFor(s.threshold! + 100).metrics : s.status === "broken" ? simFor(0).metrics : null,
      assumptions: [
        ...common,
        financed
          ? "Меняется только сумма платежа — срок, взнос и комиссии те же."
          : "Платёж начинается с 1-го месяца и идёт до конца расчёта.",
        "Ищем с точностью до 100 ₽.",
      ],
    });
  }

  // 4. Максимальная стоимость покупки / сумма кредита.
  if (isPurchaseLike(model) && model.decision.price > 0) {
    const fin = effectiveFinancing(model);
    const autoPayment = (d: ModelInput["decision"]) => {
      if (fin === "installment") d.installment.monthlyPayment = null;
      if (fin === "loan") d.loan.monthlyPayment = null;
      return d;
    };
    const userPayment = (fin === "installment" && model.decision.installment.monthlyPayment != null) || (fin === "loan" && model.decision.loan.monthlyPayment != null);
    const mk = (x: number) => withDecision(model, (d) => autoPayment({ ...d, price: x, downPayment: Math.min(d.downPayment, x) }));
    const sim = (x: number) => run(mk(x));
    const hi = Math.max(model.decision.price * 20, 1_000_000);
    const s = bisectMax(0, hi, 500, (x) => ok(sim(x)));
    const isLoan = model.kind === "loan";
    result.push({
      id: "max_price",
      title: isLoan ? "Какой кредит вы потянете" : "Какую покупку вы потянете",
      question: isLoan ? "Какую сумму кредита вы потянете при той же ставке и сроке?" : "Какую самую дорогую покупку вы потянете при том же способе оплаты?",
      unit: "rub",
      current: model.decision.price,
      threshold: s.threshold,
      status: s.status,
      direction: "max",
      method: "binary",
      step: 500,
      range: [0, hi],
      before: s.threshold != null ? sim(s.threshold).metrics : null,
      after: s.status === "found" ? sim(s.threshold! + 500).metrics : null,
      assumptions: [
        ...common,
        fin === "cash" ? "Платите всю сумму сразу в месяц покупки." : fin === "installment" ? "Платёж пересчитываем: сумма делится поровну на тот же срок." : "Платёж пересчитываем по той же ставке и сроку.",
        ...(userPayment ? ["Ваш платёж заменили расчётным, чтобы он менялся вместе с ценой."] : []),
        ...(fin !== "cash" ? ["Платежи после окончания расчёта на результат не влияют."] : []),
        "Ищем с точностью до 500 ₽.",
      ],
    });
  }

  // 5. Минимальный первоначальный взнос (систематический перебор — зависимость не обязательно монотонна).
  const fin = effectiveFinancing(model);
  if ((fin === "installment" || (fin === "loan" && model.kind !== "loan")) && model.decision.price > 0) {
    const price = model.decision.price;
    const mk = (x: number) =>
      withDecision(model, (d) => {
        d.downPayment = x;
        if (fin === "installment") d.installment.monthlyPayment = null;
        else d.loan.monthlyPayment = null;
        return d;
      });
    const sim = (x: number) => run(mk(x));
    const N = 100;
    const gridStep = price / N;
    let found: number | null = null;
    let prevFail: number | null = null;
    for (let i = 0; i <= N; i++) {
      const x = Math.round(i * gridStep);
      if (ok(sim(x))) {
        found = x;
        break;
      }
      prevFail = x;
    }
    // Уточнение между последней невыполняющей и первой выполняющей точками сетки, шаг 100 ₽.
    if (found != null && prevFail != null) {
      let a = prevFail;
      let b = found;
      while (b - a > 100) {
        const mid = Math.round((a + b) / 2);
        if (ok(sim(mid))) b = mid;
        else a = mid;
      }
      found = Math.ceil(b / 100) * 100 <= price && ok(sim(Math.ceil(b / 100) * 100)) ? Math.ceil(b / 100) * 100 : b;
    }
    const status = found == null ? "broken" : found === 0 ? "holds_all" : "found";
    result.push({
      id: "min_down",
      title: "Какой первый взнос нужен",
      question: "Какой самый маленький первый взнос позволит справиться?",
      unit: "rub",
      current: model.decision.downPayment,
      threshold: found,
      status,
      direction: "min",
      method: "scan",
      step: 100,
      range: [0, price],
      before: found != null ? sim(found).metrics : null,
      after: found != null && found > 0 ? sim(Math.max(0, found - 100)).metrics : status === "broken" ? sim(price).metrics : null,
      assumptions: [
        ...common,
        `Перебираем взнос от 0 до ${formatRub(price)} (${N} шагов) и уточняем до 100 ₽. Больший взнос уменьшает платёж, но сразу забирает больше денег, поэтому здесь нужен полный перебор.`,
        "Платёж пересчитываем для каждого варианта взноса.",
      ],
    });
  }

  // 6. Изменение дохода: максимальный перерыв без дохода.
  if (model.kind === "income_change") {
    const sim = (g: number) => run(withDecision(model, (d) => ({ ...d, incomeGapMonths: g })));
    let maxOk: number | null = null;
    for (let g = 0; g <= H; g++) {
      if (ok(sim(g))) maxOk = g;
      else break;
    }
    const status = maxOk == null ? "broken" : maxOk === H ? "holds_all" : "found";
    result.push({
      id: "max_gap",
      title: "Сколько месяцев без зарплаты вы выдержите",
      question: "Сколько месяцев без основного дохода вы переживёте при смене работы?",
      unit: "months",
      current: model.decision.incomeGapMonths,
      threshold: maxOk,
      status,
      direction: "max",
      method: "scan",
      step: 1,
      range: [0, H],
      before: maxOk != null ? sim(maxOk).metrics : null,
      after: status === "found" ? sim(maxOk! + 1).metrics : status === "broken" ? sim(0).metrics : null,
      assumptions: [...common, "Перебираем по целым месяцам, начиная с месяца перехода."],
    });
  }

  // 7. Переезд / собственный сценарий: максимальный рост регулярных расходов.
  if (model.kind === "relocation" || model.kind === "custom") {
    const sim = (x: number) => run(withDecision(model, (d) => ({ ...d, monthlyCostDelta: x })));
    const hi = Math.max(1000, model.finances.income + model.finances.extraIncome + model.finances.savings);
    const s = bisectMax(0, hi, 100, (x) => ok(sim(x)));
    result.push({
      id: "max_cost_delta",
      title: "Насколько могут вырасти расходы",
      question: "На сколько в месяц могут вырасти расходы после решения?",
      unit: "rub_month",
      current: model.decision.monthlyCostDelta,
      threshold: s.threshold,
      status: s.status,
      direction: "max",
      method: "binary",
      step: 100,
      range: [0, hi],
      before: s.threshold != null ? sim(s.threshold).metrics : null,
      after: s.status === "found" ? sim(s.threshold! + 100).metrics : s.status === "broken" ? sim(0).metrics : null,
      assumptions: [...common, `Рост расходов начинается ${fromMonth(model.decision.startMonth)}.`, "Ищем с точностью до 100 ₽."],
    });
  }

  // 8. Месяц первого нарушения — прямой расчёт.
  {
    const r = run(model);
    const first = criterion === "reserve" ? r.metrics.firstReserveBreachMonth : r.metrics.firstDeficitMonth;
    result.push({
      id: "first_breach",
      title: criterion === "reserve" ? "Когда впервые будет тронут запас" : "Когда впервые не хватит денег",
      question: criterion === "reserve" ? "В каком месяце денег впервые станет меньше запаса?" : "В каком месяце деньги впервые закончатся?",
      unit: "month",
      current: null,
      threshold: first,
      status: first == null ? "holds_all" : "found",
      direction: "min",
      method: "direct",
      step: 1,
      range: [1, H],
      before: first == null ? r.metrics : null,
      after: first != null ? r.metrics : null,
      assumptions: [...common, "Считаем напрямую по месяцам, без поиска."],
    });
  }

  return result;
}
