import { DAYS_IN_MONTH, walkDays } from "./simulate";
import type { DayOp, Goal, ModelInput, MonthRow, SimulationResult } from "./types";

/* ───────────── Долговая нагрузка (ПДН) ───────────── */

/**
 * Ориентиры взяты из правил Банка России (макропруденциальные лимиты с 2023 года):
 * банкам ограничена доля кредитов заёмщикам с нагрузкой выше 50% и особенно выше 80%.
 * Это не решение банка о выдаче и не оценка кредитоспособности.
 */
export type PdnLevel = "low" | "elevated" | "high" | "none";

export function pdnLevel(pdn: number | null): PdnLevel {
  if (pdn == null) return "none";
  if (pdn > 0.8) return "high";
  if (pdn > 0.5) return "elevated";
  return "low";
}

export const PDN_META: Record<PdnLevel, { label: string; text: string }> = {
  low: { label: "До 50%", text: "Банки чаще всего спокойно относятся к такой нагрузке. Но это не гарантия одобрения." },
  elevated: { label: "50–80%", text: "Высокая нагрузка: ЦБ ограничивает, сколько таких кредитов могут выдавать банки, поэтому одобрить новый кредит могут не все." },
  high: { label: "Больше 80%", text: "Очень высокая нагрузка: почти все деньги уходят на долги. ЦБ сильно ограничивает выдачу кредитов таким заёмщикам." },
  none: { label: "Нет дохода", text: "Дохода нет, поэтому долговую нагрузку посчитать нельзя: любые платежи идут из накоплений." },
};

/* ───────────── Цели ───────────── */

export interface GoalStatus {
  goal: Goal;
  /** Сколько нужно накопить сверх запаса с учётом целей выше по списку. */
  cumulative: number;
  reachedMonth: number | null;
  status: "on_time" | "late" | "not_reached" | "no_deadline";
  /** На сколько месяцев позже желаемого срока. */
  lateBy: number;
}

/**
 * Цели копятся по порядку: сначала первая, потом вторая и т. д.
 * Цель считается достигнутой в первый месяц, когда денег сверх запаса хватает на неё и все цели выше.
 * Деньги на цели не тратятся — это отложенная часть общего остатка.
 */
export function evaluateGoals(model: ModelInput, result: SimulationResult): GoalStatus[] {
  const reserve = model.finances.minReserve;
  let cumulative = 0;
  return (model.goals ?? []).map((goal) => {
    cumulative += goal.amount;
    const need = cumulative;
    const hit = result.rows.find((r) => r.end - reserve >= need);
    const reachedMonth = hit ? hit.month : null;
    let status: GoalStatus["status"];
    if (reachedMonth == null) status = "not_reached";
    else if (goal.targetMonth == null) status = "no_deadline";
    else status = reachedMonth <= goal.targetMonth ? "on_time" : "late";
    return { goal, cumulative: need, reachedMonth, status, lateBy: reachedMonth != null && goal.targetMonth != null ? Math.max(0, reachedMonth - goal.targetMonth) : 0 };
  });
}

/* ───────────── Календарь платежей ───────────── */

export interface CalendarDay {
  day: number;
  ops: DayOp[];
  /** Остаток на конец дня. */
  balance: number;
  /** Самый низкий остаток за день (до поступлений этого дня). */
  low: number;
  belowReserve: boolean;
  belowZero: boolean;
}

/** Остаток по дням месяца — по тем же правилам, что и дневная модель расчёта. */
export function buildCalendar(row: MonthRow, reserve: number) {
  const { balances, lows, min } = walkDays(row.start, row.dayPlan);
  const r2 = (x: number) => Math.round(x * 100) / 100;
  const days: CalendarDay[] = balances.map((b, i) => ({
    day: i + 1,
    ops: row.dayPlan.ops.filter((o) => o.day === i + 1).sort((a, c) => a.amount - c.amount),
    balance: r2(b),
    low: r2(lows[i]),
    belowReserve: lows[i] < reserve,
    belowZero: lows[i] < 0,
  }));
  const lowestDay = days.reduce((a, d) => (d.low < a.low ? d : a), days[0]);
  return { days, min: Math.round(min * 100) / 100, lowestDay, spreadPerDay: row.dayPlan.spreadPerDay, daysInMonth: DAYS_IN_MONTH };
}

/* ───────────── Куда уходят деньги ───────────── */

export interface FlowNode {
  id: string;
  label: string;
  value: number;
}

/** Источники и направления денег за выбранные месяцы. Сумма источников равна сумме направлений. */
export function moneyFlows(model: ModelInput, rows: MonthRow[]) {
  const sum = (f: (r: MonthRow) => number) => rows.reduce((a, r) => a + f(r), 0);
  const f = model.finances;
  const fixedShare = f.fixedExpenses + f.variableExpenses > 0 ? f.fixedExpenses / (f.fixedExpenses + f.variableExpenses) : 0.5;
  const expenses = sum((r) => r.expenses);
  const credits = sum((r) => r.payments + r.decisionDebt);
  const decision = sum((r) => r.decisionOut - r.decisionDebt);
  const events = sum((r) => r.eventCosts);
  const inflows = sum((r) => r.inflows);
  const outflows = sum((r) => r.outflows);

  const sources: FlowNode[] = [
    { id: "income", label: "Зарплата", value: sum((r) => r.income) },
    { id: "extra", label: "Подработка", value: sum((r) => r.extraIncome) },
    { id: "decisionIn", label: "Деньги по кредиту", value: sum((r) => r.decisionIn) },
    { id: "interest", label: "Проценты по вкладу", value: sum((r) => r.interest) },
    { id: "savings", label: "Из накоплений", value: Math.max(0, outflows - inflows) },
  ].filter((n) => n.value > 0.5);
  const sinks: FlowNode[] = [
    { id: "fixed", label: "Обязательные расходы", value: expenses * fixedShare },
    { id: "variable", label: "Расходы на жизнь", value: expenses * (1 - fixedShare) },
    { id: "credits", label: "Кредиты и рассрочки", value: credits },
    { id: "decision", label: "Само решение", value: decision },
    { id: "events", label: "Неприятности", value: events },
    { id: "saved", label: "Остаётся у вас", value: Math.max(0, inflows - outflows) },
  ].filter((n) => n.value > 0.5);
  return { sources, sinks, total: Math.max(inflows, outflows) };
}
