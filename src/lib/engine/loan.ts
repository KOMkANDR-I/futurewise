export const round2 = (x: number) => Math.round(x * 100) / 100;

/**
 * Аннуитетный платёж: P = S · r / (1 − (1 + r)^−n), где r — месячная ставка.
 * При нулевой ставке — равные доли S / n.
 */
export function annuityPayment(principal: number, annualRatePct: number, months: number): number {
  if (!Number.isInteger(months) || months <= 0) throw new RangeError("Срок должен быть целым положительным числом месяцев");
  if (!(annualRatePct >= 0) || annualRatePct > 100) throw new RangeError("Ставка должна быть в диапазоне 0–100% годовых");
  if (principal <= 0) return 0;
  const r = annualRatePct / 100 / 12;
  if (r === 0) return round2(principal / months);
  return round2((principal * r) / (1 - Math.pow(1 + r, -months)));
}

export interface LoanScheduleRow {
  /** Номер платежа по графику (1…n). */
  month: number;
  /** Регулярный платёж (без досрочного). */
  payment: number;
  interest: number;
  principal: number;
  /** Досрочное погашение в этом месяце. */
  extra: number;
  balance: number;
}

export interface LoanOptions {
  principal: number;
  annualRatePct: number;
  months: number;
  /** Платёж, указанный пользователем (только для аннуитета). */
  payment?: number | null;
  type?: "annuity" | "differentiated";
  /** Досрочные погашения: index — номер платежа по графику, в котором вносится сумма. */
  early?: { index: number; amount: number; mode: "term" | "payment" }[];
}

/**
 * График погашения. Проценты начисляются на остаток долга и округляются до копеек.
 * Аннуитет: равные платежи, последний корректируется, чтобы закрыть долг.
 * Дифференцированный: долг гасится равными частями, проценты — на остаток.
 * Досрочное погашение вносится после регулярного платежа месяца:
 *   term — платёж прежний, срок сокращается; payment — срок прежний, платёж пересчитывается.
 * Если задан пользовательский платёж и его не хватает, остаток долга после срока отражается в remaining.
 */
export function buildLoanSchedule(o: LoanOptions) {
  const n = o.months;
  const type = o.type ?? "annuity";
  const r = o.annualRatePct / 100 / 12;
  const userPay = o.payment != null && o.payment > 0 && type === "annuity" ? o.payment : null;
  let pay = userPay ?? annuityPayment(o.principal, o.annualRatePct, n);
  let part = o.principal / n;
  let balance = o.principal;
  const rows: LoanScheduleRow[] = [];
  let totalPaid = 0;
  let totalInterest = 0;
  for (let k = 1; k <= n; k++) {
    if (balance <= 0.004) break;
    const interest = round2(balance * r);
    let regular: number;
    if (type === "differentiated") {
      const principalPart = Math.min(balance, k === n ? balance : part);
      regular = round2(principalPart + interest);
    } else {
      regular = pay;
      if (balance + interest < regular || (k === n && userPay == null)) regular = round2(balance + interest);
    }
    const principalPaid = round2(regular - interest);
    balance = round2(balance - principalPaid);
    let extra = 0;
    for (const e of o.early ?? []) {
      if (e.index !== k || balance <= 0) continue;
      const amt = round2(Math.min(e.amount, balance));
      extra = round2(extra + amt);
      balance = round2(balance - amt);
      const remaining = n - k;
      if (e.mode === "payment" && balance > 0 && remaining > 0) {
        if (type === "differentiated") part = balance / remaining;
        else pay = annuityPayment(balance, o.annualRatePct, remaining);
      }
    }
    totalPaid = round2(totalPaid + regular + extra);
    totalInterest = round2(totalInterest + interest);
    rows.push({ month: k, payment: regular, interest, principal: principalPaid, extra, balance: Math.max(0, balance) });
  }
  return { rows, totalPaid, totalInterest, remaining: Math.max(0, balance), payment: rows[0]?.payment ?? 0 };
}

/** Совместимый вызов для аннуитетного графика без досрочных погашений. */
export function loanSchedule(principal: number, annualRatePct: number, months: number, payment?: number | null) {
  const s = buildLoanSchedule({ principal, annualRatePct, months, payment });
  const p = payment != null && payment > 0 ? payment : annuityPayment(principal, annualRatePct, months);
  return { ...s, payment: p };
}

/**
 * Полная стоимость кредита (ПСК), % годовых, для ежемесячных платежей:
 * ПСК = i × 12 × 100, где i — месячная ставка, при которой сумма дисконтированных потоков равна нулю.
 * cashflows[0] — что получил заёмщик в день выдачи (сумма минус разовые комиссии),
 * cashflows[k] — сколько он заплатил в k-м месяце (положительные числа).
 */
export function fullLoanCost(received: number, payments: number[]): number | null {
  if (!(received > 0) || payments.length === 0) return null;
  const npv = (i: number) => payments.reduce((s, p, k) => s + p / Math.pow(1 + i, k + 1), 0) - received;
  // npv убывает по i: при i = 0 это «всего заплачено − получено».
  if (npv(0) <= 0) return 0;
  let lo = 0;
  let hi = 1;
  while (npv(hi) > 0 && hi < 100) hi *= 2;
  for (let it = 0; it < 200; it++) {
    const mid = (lo + hi) / 2;
    if (npv(mid) > 0) lo = mid;
    else hi = mid;
  }
  return Math.round(((lo + hi) / 2) * 12 * 100 * 1000) / 1000;
}
