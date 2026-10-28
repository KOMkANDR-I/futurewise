import { annuityPayment, buildLoanSchedule, fullLoanCost, round2 } from "./loan";
import { cap, formatPct, formatRub, fromMonth, inMonth, pluralMonths } from "../format";
import type { DecisionPlan, Flow, ModelInput } from "./types";

/** Какой способ оплаты фактически действует для сценария. */
export function effectiveFinancing(model: ModelInput) {
  if (model.kind === "installment") return "installment" as const;
  if (model.kind === "loan") return "loan" as const;
  if (model.kind === "purchase") return model.decision.financing;
  return null;
}

export const isPurchaseLike = (model: ModelInput) =>
  model.kind === "purchase" || model.kind === "installment" || model.kind === "loan";

/**
 * Превращает решение пользователя в денежные потоки по месяцам.
 * Функция чистая: не изменяет входные данные.
 * Внимание: подписи потоков «Платёж по рассрочке» и «Платёж по кредиту» используются
 * в поиске порогов и карте устойчивости — менять их нужно синхронно.
 */
export function buildDecisionPlan(model: ModelInput): DecisionPlan {
  const d = model.decision;
  const start = Math.max(1, Math.round(d.startMonth));
  const flows: Flow[] = [];
  const considered: string[] = [];
  const unknown: string[] = [];
  const assumptions: string[] = [];
  const warnings: string[] = [];
  const plan: DecisionPlan = {
    flows,
    incomeChange: null,
    recurringCost: null,
    monthlyPayment: null,
    termMonths: null,
    firstPaymentMonth: null,
    financedAmount: 0,
    totalCost: 0,
    overpayment: 0,
    acquireMonth: null,
    psk: null,
    loanSchedule: null,
    interestSaved: 0,
    considered,
    unknown,
    assumptions,
    warnings,
  };

  const financing = effectiveFinancing(model);
  const firstPay = d.firstPaymentNow ? start : start + 1;
  if (start > model.horizon)
    warnings.push(`Решение приходится на ${start}-й месяц, а вы считаете только ${pluralMonths(model.horizon)} вперёд. Поэтому в расчёт оно не попадёт.`);

  if (financing === "cash") {
    flows.push({ label: "Оплата покупки", type: "out", month: start, amounts: [d.price] });
    plan.totalCost = d.price;
    plan.acquireMonth = start;
    considered.push(`Оплата всей суммы ${formatRub(d.price)} ${inMonth(start)}`);
    if (start > 1) assumptions.push(`Покупку откладываете: до ${start}-го месяца деньги просто лежат у вас, проценты на них не считаем.`);
  }

  if (financing === "installment") {
    const financed = Math.max(0, d.price - d.downPayment);
    const n = Math.max(1, Math.round(d.installment.months));
    let pay: number;
    if (d.installment.monthlyPayment != null && d.installment.monthlyPayment > 0) {
      pay = d.installment.monthlyPayment;
      considered.push(`Платёж ${formatRub(pay)} в месяц — вы указали его сами`);
      const total = pay * n;
      if (total + 1 < financed)
        warnings.push(`Если платить ${formatRub(pay)} ${pluralMonths(n)}, выйдет ${formatRub(total)} — это меньше, чем нужно вернуть (${formatRub(financed)}). Проверьте условия: возможно, срок дольше.`);
    } else {
      pay = round2(financed / n);
      assumptions.push(`Платёж вы не указали, поэтому делим сумму поровну: ${formatRub(financed)} ÷ ${n} = ${formatRub(pay)} в месяц.`);
    }
    if (d.downPayment > 0) flows.push({ label: "Первый взнос", type: "out", month: start, amounts: [d.downPayment] });
    if (d.installment.fees > 0) {
      flows.push({ label: "Комиссия рассрочки", type: "out", month: start, amounts: [d.installment.fees] });
      considered.push(`Разовая комиссия ${formatRub(d.installment.fees)}`);
    } else unknown.push("Комиссию за рассрочку вы не указали — считаем, что её нет");
    flows.push({ label: "Платёж по рассрочке", type: "out", month: firstPay, amounts: Array(n).fill(pay), debt: true });
    plan.monthlyPayment = pay;
    plan.termMonths = n;
    plan.firstPaymentMonth = firstPay;
    plan.financedAmount = financed;
    plan.totalCost = round2(d.downPayment + pay * n + d.installment.fees);
    plan.overpayment = round2(plan.totalCost - d.price);
    plan.acquireMonth = start;
    considered.push(`Первый взнос ${formatRub(d.downPayment)}, срок — ${pluralMonths(n)}`);
  }

  if (financing === "loan") {
    const L = d.loan;
    const n = Math.max(1, Math.round(L.months));
    // Для кредита на покупку сумма кредита = стоимость − взнос; для сценария «кредит» price — это сумма кредита.
    const principal = model.kind === "loan" ? d.price : Math.max(0, d.price - d.downPayment);
    const annuity = principal > 0 ? annuityPayment(principal, L.annualRate, n) : 0;
    const diff = L.repayment === "differentiated";
    const userPay = !diff && L.monthlyPayment != null && L.monthlyPayment > 0 ? L.monthlyPayment : null;
    const early = (L.early ?? [])
      .filter((e) => e.amount > 0)
      .map((e) => ({ index: e.month - firstPay + 1, amount: e.amount, mode: e.mode, month: e.month }));
    for (const e of early)
      if (e.index < 1 || e.index > n) warnings.push(`Досрочный платёж в ${e.month}-м месяце не попадает в срок кредита (платежи идут с ${firstPay}-го по ${firstPay + n - 1}-й месяц) — его не учитываем.`);
    const validEarly = early.filter((e) => e.index >= 1 && e.index <= n);
    const sched = buildLoanSchedule({ principal, annualRatePct: L.annualRate, months: n, payment: userPay, type: diff ? "differentiated" : "annuity", early: validEarly });
    if (diff) {
      considered.push(`Платежи уменьшаются каждый месяц (дифференцированные): первый — ${formatRub(sched.rows[0]?.payment ?? 0)}, последний — ${formatRub(sched.rows[sched.rows.length - 1]?.payment ?? 0)}`);
      if (L.monthlyPayment != null && L.monthlyPayment > 0) warnings.push("При убывающих платежах ваш фиксированный платёж не используется — считаем по графику.");
    } else if (userPay != null) {
      considered.push(`Платёж ${formatRub(userPay)} в месяц — вы указали его сами`);
      if (Math.abs(userPay - annuity) > Math.max(1, annuity * 0.01))
        warnings.push(`Ваш платёж ${formatRub(userPay)} не совпадает с расчётным (${formatRub(annuity)}) при ставке ${formatPct(L.annualRate)} годовых на ${pluralMonths(n)}. Считаем по вашему платежу.`);
      if (sched.remaining > 1) warnings.push(`С таким платежом кредит не успеет закрыться за ${pluralMonths(n)}: останется долг ${formatRub(sched.remaining)}.`);
    } else {
      considered.push(`Платёж по кредиту ${formatRub(annuity)} в месяц: ставка ${formatPct(L.annualRate)} годовых, срок — ${pluralMonths(n)}`);
    }
    for (const e of validEarly)
      considered.push(`Досрочно ${formatRub(e.amount)} ${inMonth(e.month)} — ${e.mode === "term" ? "сокращаем срок" : "уменьшаем платёж"}`);
    if (model.kind === "loan") {
      if (L.proceedsUse === "keep") {
        flows.push({ label: "Получение кредита", type: "in", month: start, amounts: [principal] });
        assumptions.push("Деньги по кредиту приходят на счёт и остаются у вас.");
      } else {
        assumptions.push("Деньги по кредиту сразу уходят на покупку, на счёт они не попадают.");
      }
    } else if (d.downPayment > 0) {
      flows.push({ label: "Первый взнос", type: "out", month: start, amounts: [d.downPayment] });
    }
    if (L.oneTimeFees > 0) {
      flows.push({ label: "Разовые комиссии кредита", type: "out", month: start, amounts: [L.oneTimeFees] });
      considered.push(`Разовые комиссии ${formatRub(L.oneTimeFees)}`);
    } else unknown.push("Разовые комиссии по кредиту вы не указали — считаем, что их нет");
    if (L.monthlyFees > 0) considered.push(`Страховка и ежемесячные комиссии — ${formatRub(L.monthlyFees)}`);
    else unknown.push("Страховку и ежемесячные комиссии вы не указали — считаем, что их нет");
    const amounts = sched.rows.map((r) => round2(r.payment + (r.payment > 0 ? L.monthlyFees : 0)));
    flows.push({ label: "Платёж по кредиту", type: "out", month: firstPay, amounts, debt: true });
    const extras = sched.rows.map((r) => r.extra);
    if (extras.some((x) => x > 0)) flows.push({ label: "Досрочное погашение", type: "out", month: firstPay, amounts: extras });
    plan.monthlyPayment = round2(sched.payment + L.monthlyFees);
    plan.loanSchedule = sched.rows.map((r) => ({ ...r, month: r.month + firstPay - 1 }));
    plan.psk = principal > 0 ? fullLoanCost(principal - L.oneTimeFees, sched.rows.map((r, i) => amounts[i] + r.extra)) : null;
    if (plan.psk != null) considered.push(`Полная стоимость кредита (ПСК) — ${formatPct(plan.psk)} годовых: ставка вместе со всеми указанными комиссиями и страховкой`);
    if (validEarly.length) {
      const plain = buildLoanSchedule({ principal, annualRatePct: L.annualRate, months: n, payment: userPay, type: diff ? "differentiated" : "annuity" });
      plan.interestSaved = round2(Math.max(0, plain.totalInterest - sched.totalInterest));
      if (plan.interestSaved > 0) considered.push(`Досрочные погашения экономят на процентах ${formatRub(plan.interestSaved)}`);
      assumptions.push("Считаем, что за досрочное погашение банк не берёт комиссию.");
    }
    plan.termMonths = n;
    plan.firstPaymentMonth = firstPay;
    plan.financedAmount = principal;
    const paid = amounts.reduce((a, b) => a + b, 0) + extras.reduce((a, b) => a + b, 0);
    plan.totalCost = round2((model.kind === "loan" ? 0 : d.downPayment) + paid + L.oneTimeFees);
    plan.overpayment = round2(paid + L.oneTimeFees - principal);
    plan.acquireMonth = start;
    assumptions.push(`Проценты начисляются каждый месяц на оставшийся долг.${validEarly.length ? "" : " Досрочных погашений нет."}`);
  }

  if (model.kind === "income_change") {
    plan.incomeChange = { fromMonth: start, gapMonths: Math.max(0, Math.round(d.incomeGapMonths)), newIncome: d.newIncome };
    if (d.oneTimeCost > 0) flows.push({ label: "Траты на переход", type: "out", month: start, amounts: [d.oneTimeCost] });
    considered.push(
      `${cap(fromMonth(start))}: ${d.incomeGapMonths > 0 ? `${pluralMonths(d.incomeGapMonths)} без зарплаты, потом ` : ""}доход ${formatRub(d.newIncome ?? model.finances.income)}`,
    );
    plan.totalCost = d.oneTimeCost;
    plan.acquireMonth = start;
  }

  if (model.kind === "relocation" || model.kind === "custom") {
    if (d.oneTimeCost > 0) flows.push({ label: model.kind === "relocation" ? "Траты на переезд" : "Разовая трата", type: "out", month: start, amounts: [d.oneTimeCost] });
    if (d.monthlyCostDelta !== 0) {
      const months = d.recurringMonths > 0 ? Math.round(d.recurringMonths) : Math.max(0, model.horizon - start + 1);
      plan.recurringCost = { fromMonth: start, months, amount: d.monthlyCostDelta };
      considered.push(
        `Расходы ${d.monthlyCostDelta > 0 ? "больше" : "меньше"} на ${formatRub(Math.abs(d.monthlyCostDelta))} в месяц ${fromMonth(start)}${d.recurringMonths > 0 ? `, ${pluralMonths(months)}` : " и дальше"}`,
      );
    }
    if (model.kind === "relocation" && d.newIncome != null) {
      plan.incomeChange = { fromMonth: start, gapMonths: 0, newIncome: d.newIncome };
      considered.push(`Доход после переезда — ${formatRub(d.newIncome)}`);
    }
    if (d.oneTimeCost > 0) considered.push(`Разовые траты ${formatRub(d.oneTimeCost)} ${inMonth(start)}`);
    plan.totalCost = d.oneTimeCost + Math.max(0, d.monthlyCostDelta) * (plan.recurringCost?.months ?? 0);
    plan.acquireMonth = start;
  }

  if (model.kind === "cushion") {
    considered.push(`Цель подушки — ${formatRub(d.cushionTarget)}`);
    assumptions.push("Подушка — это часть ваших общих денег, отдельно мы её не храним.");
  }

  return plan;
}
