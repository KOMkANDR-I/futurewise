import { buildDecisionPlan } from "./decision";
import { describeEvent } from "./meta";
import { round2 } from "./loan";
import { validateModel } from "./schema";
import type { CrashTestResult, DayOp, DecisionPlan, Metrics, Mode, ModelInput, ModelSettings, MonthRow, SimulationResult, StressEvent } from "./types";

/** События, действующие в режиме. Каждое событие входит в набор не более одного раза. */
export function eventsForMode(events: StressEvent[], mode: Mode): StressEvent[] {
  if (mode === "base") return [];
  const enabled = events.filter((e) => e.enabled);
  return mode === "adverse" ? enabled.filter((e) => e.tier === "adverse") : enabled;
}

const active = (e: StressEvent, m: number) => m >= e.month && m < e.month + Math.max(1, e.duration);

export const DEFAULT_SETTINGS: ModelSettings = {
  inflationPct: 0,
  incomeIndexPct: 0,
  savingsRatePct: 0,
  cashTiming: "month",
  payday: 25,
  paymentDay: 5,
  incomeVarPct: 0,
  expenseVarPct: 0,
};
export const resolveSettings = (s?: Partial<ModelSettings>): Required<ModelSettings> => ({ ...DEFAULT_SETTINGS, ...(s ?? {}) }) as Required<ModelSettings>;

/** Множитель годового роста для месяца m: (1 + p)^((m − 1) / 12). */
const growth = (pct: number, m: number) => (pct ? Math.pow(1 + pct / 100, (m - 1) / 12) : 1);

export const DAYS_IN_MONTH = 30;
export const ONE_TIME_DAY = 15;

/**
 * Дневная модель месяца (30 условных дней): равномерные траты списываются каждый день,
 * точечные операции — в свой день. Если в один день есть и списания, и поступления,
 * сначала идут списания (консервативно). Возвращает остаток на конец каждого дня и минимум.
 */
export function walkDays(start: number, plan: { spreadPerDay: number; ops: DayOp[] }) {
  let bal = start;
  let min = start;
  const balances: number[] = [];
  /** Самый низкий остаток внутри дня — после списаний, до поступлений. */
  const lows: number[] = [];
  for (let d = 1; d <= DAYS_IN_MONTH; d++) {
    bal -= plan.spreadPerDay;
    for (const op of plan.ops) if (op.day === d && op.amount < 0) bal += op.amount;
    min = Math.min(min, bal);
    lows.push(bal);
    for (const op of plan.ops) if (op.day === d && op.amount > 0) bal += op.amount;
    balances.push(bal);
  }
  return { balances, lows, min };
}

/** Необязательные множители дохода и расходов по месяцам (для анализа разброса). */
export interface SimulationNoise {
  income?: number[];
  expenses?: number[];
}

/**
 * Модель денежного потока.
 * Остаток на конец месяца = остаток на начало + поступления − расходы − платежи.
 * По умолчанию — месячное приближение (остаток проверяется на конец месяца);
 * в режиме cashTiming = "payday" проверяется самая низкая точка внутри месяца.
 */
export function simulateWith(model: ModelInput, events: StressEvent[], plan: DecisionPlan = buildDecisionPlan(model), noise?: SimulationNoise): SimulationResult {
  const { finances: f, horizon } = model;
  const H = horizon;
  const reserve = f.minReserve;
  const s = resolveSettings(model.settings);
  const debts = f.debts ?? [];
  const dayOf = (d: number | null | undefined) => Math.min(28, Math.max(1, d ?? s.paymentDay));

  // 1. Основной доход по месяцам с учётом решения (смена дохода), индексации и снижений.
  const mainIncome: number[] = new Array(H + 2).fill(0);
  const baseMain: number[] = new Array(H + 2).fill(0);
  for (let m = 1; m <= H; m++) {
    let base = f.income;
    const ic = plan.incomeChange;
    if (ic && m >= ic.fromMonth) base = m < ic.fromMonth + ic.gapMonths ? 0 : ic.newIncome ?? f.income;
    base *= growth(s.incomeIndexPct, m) * (noise?.income?.[m] ?? 1);
    baseMain[m] = base;
    const drop = Math.min(100, events.filter((e) => e.type === "income_drop" && active(e, m)).reduce((a, e) => a + e.value, 0));
    mainIncome[m] = base * (1 - drop / 100);
  }
  // 2. Задержки: доход месяцев [month, month+duration) переносится на value месяцев позже.
  //    Перенос рассчитывается от исходного массива, чтобы событие не применялось повторно к уже перенесённым деньгам.
  const shifted = mainIncome.slice();
  for (const e of events) {
    if (e.type !== "income_delay" || e.value <= 0) continue;
    const delay = Math.round(e.value);
    for (let m = e.month; m < e.month + Math.max(1, e.duration) && m <= H; m++) {
      const amount = mainIncome[m];
      shifted[m] -= amount;
      if (m + delay <= H) shifted[m + delay] += amount;
    }
  }

  // 3. Потоки решения по месяцам (с разметкой: какие из них — обязательные платежи по долгу).
  const decisionIn: number[] = new Array(H + 2).fill(0);
  const decisionOut: number[] = new Array(H + 2).fill(0);
  const decisionDebt: number[] = new Array(H + 2).fill(0);
  const decisionOps: DayOp[][] = Array.from({ length: H + 2 }, () => []);
  for (const fl of plan.flows) {
    fl.amounts.forEach((a, i) => {
      const m = fl.month + i;
      if (m < 1 || m > H || a === 0) return;
      if (fl.type === "in") {
        decisionIn[m] += a;
        decisionOps[m].push({ day: 1, amount: a, label: fl.label, kind: "decision" });
      } else {
        decisionOut[m] += a;
        if (fl.debt) decisionDebt[m] += a;
        decisionOps[m].push({ day: s.paymentDay, amount: -a, label: fl.label, kind: fl.debt ? "debt" : "decision" });
      }
    });
  }

  const rows: MonthRow[] = [];
  let balance = f.savings;
  for (let m = 1; m <= H; m++) {
    const start = balance;
    const extraLossPct = Math.min(100, events.filter((e) => e.type === "extra_income_loss" && active(e, m)).reduce((a, e) => a + e.value, 0));
    const extraBase = f.extraIncome * growth(s.incomeIndexPct, m) * (noise?.income?.[m] ?? 1);
    const extraIncome = extraBase * (1 - extraLossPct / 100);
    const income = Math.max(0, shifted[m]);
    const infl = growth(s.inflationPct, m);
    const regular = (f.fixedExpenses + f.variableExpenses) * infl * (noise?.expenses?.[m] ?? 1);

    let expenses = regular;
    const rc = plan.recurringCost;
    if (rc && m >= rc.fromMonth && m < rc.fromMonth + rc.months) expenses += rc.amount * infl;
    expenses = Math.max(0, expenses);

    const ops: DayOp[] = [...decisionOps[m]];
    let eventOneTime = 0;
    let eventSpread = 0;
    let eventPayments = 0;
    const activeEvents: string[] = [];
    for (const e of events) {
      if (e.type === "unexpected_expense" && e.month === m) {
        eventOneTime += e.value;
        ops.push({ day: ONE_TIME_DAY, amount: -e.value, label: describeEvent(e), kind: "event" });
        activeEvents.push(e.id);
      } else if (e.type === "expense_increase" && active(e, m)) {
        eventSpread += (regular * e.value) / 100;
        activeEvents.push(e.id);
      } else if (e.type === "new_payment" && active(e, m)) {
        eventPayments += e.value;
        ops.push({ day: s.paymentDay, amount: -e.value, label: describeEvent(e), kind: "event" });
        activeEvents.push(e.id);
      } else if ((e.type === "income_drop" || e.type === "extra_income_loss") && active(e, m)) {
        activeEvents.push(e.id);
      } else if (e.type === "income_delay" && (active(e, m) || (m >= e.month + e.value && m < e.month + e.value + e.duration))) {
        activeEvents.push(e.id);
      }
    }

    // Действующие долги: прочие платежи без срока + список долгов, каждый со своим сроком и днём.
    let payments = f.existingPayments;
    if (f.existingPayments > 0) ops.push({ day: s.paymentDay, amount: -f.existingPayments, label: "Прочие платежи", kind: "debt" });
    for (const d of debts) {
      if (d.monthlyPayment <= 0 || (d.monthsLeft > 0 && m > d.monthsLeft)) continue;
      payments += d.monthlyPayment;
      ops.push({ day: dayOf(d.day), amount: -d.monthlyPayment, label: d.name || "Платёж", kind: "debt" });
    }

    if (income > 0) ops.push({ day: s.payday, amount: income, label: "Зарплата", kind: "income" });
    if (extraIncome > 0) ops.push({ day: s.payday, amount: extraIncome, label: "Подработка", kind: "income" });

    const eventCosts = eventOneTime + eventSpread + eventPayments;
    const interest = start > 0 && s.savingsRatePct > 0 ? (start * s.savingsRatePct) / 100 / 12 : 0;
    if (interest > 0) ops.push({ day: DAYS_IN_MONTH, amount: interest, label: "Проценты по вкладу", kind: "interest" });
    const inflows = income + extraIncome + decisionIn[m] + interest;
    const outflows = expenses + payments + decisionOut[m] + eventCosts;
    const end = round2(start + inflows - outflows);
    const incomeLost = Math.max(0, baseMain[m] - income) + Math.max(0, extraBase - extraIncome);
    const dayPlan = { spreadPerDay: (expenses + eventSpread) / DAYS_IN_MONTH, ops };
    const low = s.cashTiming === "payday" ? round2(Math.min(end, walkDays(start, dayPlan).min)) : end;

    const debtPayments = payments + decisionDebt[m] + eventPayments;
    const monthIncome = income + extraIncome;
    rows.push({
      month: m,
      start: round2(start),
      income: round2(income),
      extraIncome: round2(extraIncome),
      decisionIn: round2(decisionIn[m]),
      expenses: round2(expenses),
      payments: round2(payments),
      decisionOut: round2(decisionOut[m]),
      eventCosts: round2(eventCosts),
      incomeLost: round2(incomeLost),
      interest: round2(interest),
      inflows: round2(inflows),
      outflows: round2(outflows),
      end,
      lowPoint: low,
      belowReserve: low < reserve,
      belowZero: low < 0,
      activeEvents,
      debtPayments: round2(debtPayments),
      decisionDebt: round2(decisionDebt[m]),
      pdn: monthIncome > 0 ? debtPayments / monthIncome : debtPayments > 0 ? null : 0,
      dayPlan,
    });
    balance = end;
  }

  return { rows, metrics: computeMetrics(rows, f.savings, reserve), eventIds: events.map((e) => e.id) };
}

export function computeMetrics(rows: MonthRow[], startBalance: number, reserve: number): Metrics {
  let min = Infinity;
  let minMonth = 0;
  let firstDeficit: number | null = null;
  let firstBreach: number | null = null;
  let deficitMonths = 0;
  let breachMonths = 0;
  let totalIn = 0;
  let totalOut = 0;
  let decisionPaid = 0;
  let eventCosts = 0;
  let incomeLost = 0;
  let pdnMax: number | null = null;
  let pdnMaxMonth: number | null = null;
  for (const r of rows) {
    if (r.lowPoint < min) {
      min = r.lowPoint;
      minMonth = r.month;
    }
    if (r.belowZero) {
      deficitMonths++;
      if (firstDeficit == null) firstDeficit = r.month;
    }
    if (r.belowReserve) {
      breachMonths++;
      if (firstBreach == null) firstBreach = r.month;
    }
    if (r.pdn != null && (pdnMax == null || r.pdn > pdnMax)) {
      pdnMax = r.pdn;
      pdnMaxMonth = r.month;
    }
    totalIn += r.inflows;
    totalOut += r.outflows;
    decisionPaid += r.decisionOut - r.decisionIn;
    eventCosts += r.eventCosts;
    incomeLost += r.incomeLost;
  }
  if (rows.length === 0) min = startBalance;
  const status = min < 0 ? "deficit" : min < reserve ? "reserve" : "ok";
  return {
    startBalance,
    endBalance: rows.length ? rows[rows.length - 1].end : startBalance,
    minBalance: round2(min),
    minMonth,
    firstDeficitMonth: firstDeficit,
    firstReserveBreachMonth: firstBreach,
    deficitMonths,
    reserveBreachMonths: breachMonths,
    deficitShortfall: round2(Math.max(0, -min)),
    reserveShortfall: round2(Math.max(0, reserve - min)),
    totalInflows: round2(totalIn),
    totalOutflows: round2(totalOut),
    decisionPaidInHorizon: round2(decisionPaid),
    eventCosts: round2(eventCosts),
    incomeLost: round2(incomeLost),
    status,
    pdnMax: pdnMax == null ? null : Math.round(pdnMax * 10000) / 10000,
    pdnMaxMonth,
  };
}

export function simulate(model: ModelInput, mode: Mode, plan?: DecisionPlan): SimulationResult {
  return simulateWith(model, eventsForMode(model.events, mode), plan);
}

/** Список допущений, соответствующий фактическим настройкам модели. */
export function modelAssumptions(model: ModelInput): string[] {
  const s = resolveSettings(model.settings);
  return [
    s.cashTiming === "payday"
      ? `Считаем по дням: зарплата приходит ${s.payday}-го числа, платежи списываются ${s.paymentDay}-го (если у кредита не указан свой день), непредвиденные траты — 15-го, обычные расходы — понемногу каждый день. Запас проверяем в самый «тонкий» момент месяца.`
      : "Считаем по месяцам: смотрим, сколько денег остаётся в конце каждого месяца. Что происходит внутри месяца (например, до зарплаты), не учитываем.",
    s.inflationPct || s.incomeIndexPct
      ? `Обычные расходы дорожают на ${s.inflationPct}% в год, доход растёт на ${s.incomeIndexPct}% в год. Платежи по кредитам и рассрочкам не меняются.`
      : "Доходы и расходы со временем не меняются — если их не меняет само решение или события. Инфляцию не учитываем.",
    s.savingsRatePct ? `На деньги на счёте каждый месяц начисляются проценты: ${s.savingsRatePct}% годовых.` : "Проценты по вкладам не учитываем.",
    "Долговая нагрузка считается от всего дохода, который вы ввели. Банк смотрит на подтверждённый доход, поэтому у него цифра может быть выше.",
    "Налоговые вычеты и кешбэк не учитываем.",
    "Если в одном месяце совпали несколько снижений дохода, они складываются (но не больше 100%).",
    "Это не прогноз, а проверка «что будет, если». Насколько вероятны события, мы не знаем — если только вы сами не укажете вероятность.",
  ];
}

export const BASE_ASSUMPTIONS = modelAssumptions({ settings: DEFAULT_SETTINGS } as ModelInput);

/** Полный краш-тест: три режима и влияние каждого события по отдельности. */
export function runCrashTest(model: ModelInput): CrashTestResult {
  const validation = validateModel(model);
  const plan = buildDecisionPlan(model);
  const modes = {
    base: simulate(model, "base", plan),
    adverse: simulate(model, "adverse", plan),
    stress: simulate(model, "stress", plan),
  };
  const baseMin = modes.base.metrics.minBalance;
  const eventImpacts = model.events
    .filter((e) => e.enabled)
    .map((e) => {
      const result = simulateWith(model, [e], plan);
      return { eventId: e.id, label: describeEvent(e), minBalanceDelta: round2(result.metrics.minBalance - baseMin), result };
    });
  return {
    validation,
    plan,
    modes,
    eventImpacts,
    assumptions: [...modelAssumptions(model), ...plan.assumptions],
  };
}
