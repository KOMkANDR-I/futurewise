import { EVENT_META } from "./meta";
import type { Decision, Finances, ModelInput, ScenarioKind, StressEvent, StressEventType } from "./types";

export const defaultFinances = (): Finances => ({
  income: 60000,
  extraIncome: 0,
  fixedExpenses: 25000,
  variableExpenses: 10000,
  savings: 50000,
  existingPayments: 0,
  minReserve: 20000,
  debts: [],
});

export const defaultDecision = (kind: ScenarioKind = "purchase"): Decision => ({
  price: kind === "loan" ? 300000 : kind === "cushion" ? 0 : 90000,
  downPayment: 0,
  financing: kind === "installment" ? "installment" : kind === "loan" ? "loan" : "cash",
  startMonth: 1,
  firstPaymentNow: false,
  installment: { months: 9, monthlyPayment: null, fees: 0 },
  loan: { months: 24, annualRate: 20, oneTimeFees: 0, monthlyFees: 0, monthlyPayment: null, proceedsUse: "spend", repayment: "annuity", early: [] },
  newIncome: kind === "income_change" ? 50000 : null,
  incomeGapMonths: kind === "income_change" ? 1 : 0,
  oneTimeCost: kind === "relocation" ? 60000 : kind === "custom" ? 30000 : 0,
  monthlyCostDelta: kind === "relocation" ? 8000 : 0,
  recurringMonths: 0,
  cushionTarget: kind === "cushion" ? 180000 : 0,
});

let seq = 0;
export const newEventId = () => `ev_${Date.now().toString(36)}_${(seq++).toString(36)}`;

export function makeEvent(type: StressEventType, patch: Partial<StressEvent> = {}): StressEvent {
  return { id: newEventId(), type, enabled: true, tier: "adverse", probability: null, ...EVENT_META[type].defaults, ...patch };
}

export function defaultModel(kind: ScenarioKind = "purchase"): ModelInput {
  return {
    kind,
    finances: defaultFinances(),
    decision: defaultDecision(kind),
    horizon: 12,
    events: [makeEvent("income_drop", { tier: "adverse" }), makeEvent("unexpected_expense", { tier: "stress", month: 3 })],
    settings: { inflationPct: 0, incomeIndexPct: 0, savingsRatePct: 0, cashTiming: "month", payday: 25, paymentDay: 5, incomeVarPct: 0, expenseVarPct: 0 },
    goals: [],
  };
}

/**
 * Демосценарий (условные числа): доход 60 000 ₽, расходы 35 000 ₽ (25 000 обязательные + 10 000 переменные),
 * накопления 50 000 ₽, покупка 90 000 ₽, резерв 20 000 ₽, горизонт 12 мес.
 * Способ оплаты выбирает пользователь — платёж 10 000 ₽/мес применяется только к рассрочке.
 */
export function demoModel(payment: "cash" | "installment" | "save"): ModelInput {
  const base = defaultModel(payment === "installment" ? "installment" : "purchase");
  base.finances = defaultFinances();
  base.decision.price = 90000;
  base.decision.downPayment = 0;
  if (payment === "installment") {
    base.decision.financing = "installment";
    base.decision.installment = { months: 9, monthlyPayment: 10000, fees: 0 };
  } else {
    base.decision.financing = "cash";
    base.decision.startMonth = payment === "save" ? 4 : 1;
  }
  base.events = [
    makeEvent("income_drop", { value: 20, month: 2, duration: 2, tier: "adverse" }),
    makeEvent("unexpected_expense", { value: 15000, month: 3, tier: "stress" }),
  ];
  return base;
}
