import { describe, expect, it } from "vitest";
import {
  buildCalendar,
  buildDecisionPlan,
  buildLoanSchedule,
  defaultModel,
  demoModel,
  evaluateGoals,
  fullLoanCost,
  makeEvent,
  moneyFlows,
  pdnLevel,
  runRanges,
  simulate,
  validateModel,
  type ModelInput,
} from "@/lib/engine";
import { decodeBytes, detectColumns, extractRows, findHeader, parseAmount, parseCsv, parseDate, summarizeStatement } from "@/lib/import/statement";

function plain(patch: Partial<ModelInput["finances"]> = {}, settings: Partial<NonNullable<ModelInput["settings"]>> = {}): ModelInput {
  const m = defaultModel("custom");
  m.decision.oneTimeCost = 0;
  m.events = [];
  m.finances = { ...m.finances, ...patch };
  m.settings = { ...m.settings!, ...settings };
  return m;
}

describe("кредит: виды платежей, досрочка, ПСК", () => {
  it("дифференцированные платежи убывают, проценты на остаток", () => {
    const s = buildLoanSchedule({ principal: 120000, annualRatePct: 12, months: 12, type: "differentiated" });
    expect(s.rows[0].payment).toBe(11200);
    expect(s.rows[11].payment).toBe(10100);
    expect(s.totalInterest).toBeCloseTo(7800, 2);
    expect(s.remaining).toBe(0);
  });

  it("досрочка с сокращением срока: платёж прежний, месяцев меньше, процентов меньше", () => {
    const plainS = buildLoanSchedule({ principal: 100000, annualRatePct: 12, months: 12 });
    const s = buildLoanSchedule({ principal: 100000, annualRatePct: 12, months: 12, early: [{ index: 3, amount: 30000, mode: "term" }] });
    expect(s.rows.length).toBeLessThan(12);
    expect(s.rows[4].payment).toBe(plainS.rows[4].payment);
    expect(s.totalInterest).toBeLessThan(plainS.totalInterest);
    expect(s.remaining).toBe(0);
  });

  it("досрочка с уменьшением платежа: срок прежний, платёж ниже", () => {
    const s = buildLoanSchedule({ principal: 100000, annualRatePct: 12, months: 12, early: [{ index: 3, amount: 30000, mode: "payment" }] });
    expect(s.rows).toHaveLength(12);
    expect(s.rows[3].payment).toBeLessThan(s.rows[0].payment);
    expect(s.remaining).toBe(0);
  });

  it("ПСК без комиссий равна ставке, с комиссией — выше", () => {
    const s = buildLoanSchedule({ principal: 100000, annualRatePct: 12, months: 12 });
    expect(fullLoanCost(100000, s.rows.map((r) => r.payment))).toBeCloseTo(12, 1);
    expect(fullLoanCost(98000, s.rows.map((r) => r.payment))!).toBeGreaterThan(15);
    expect(fullLoanCost(120000, Array(12).fill(10000))).toBe(0);
  });

  it("план кредита: ПСК, досрочный поток и экономия", () => {
    const m = defaultModel("loan");
    m.decision.price = 100000;
    m.decision.loan = { ...m.decision.loan, months: 12, annualRate: 12, oneTimeFees: 0, monthlyFees: 0, early: [{ id: "e1", month: 4, amount: 30000, mode: "term" }] };
    const p = buildDecisionPlan(m);
    expect(p.psk).toBeCloseTo(12, 0);
    expect(p.flows.some((f) => f.label === "Досрочное погашение")).toBe(true);
    expect(p.interestSaved).toBeGreaterThan(0);
    expect(p.loanSchedule![0].month).toBe(2); // первый платёж — со следующего месяца
  });
});

describe("долги со сроком и долговая нагрузка", () => {
  it("платёж по долгу заканчивается после последнего месяца", () => {
    const r = simulate(plain({ debts: [{ id: "d", name: "Рассрочка", kind: "installment", monthlyPayment: 5000, monthsLeft: 3, day: null }] }), "base");
    expect(r.rows.slice(0, 3).map((x) => x.payments)).toEqual([5000, 5000, 5000]);
    expect(r.rows[3].payments).toBe(0);
  });

  it("ПДН = платежи по долгам / доход", () => {
    const r = simulate(plain({ debts: [{ id: "d", name: "Кредит", kind: "loan", monthlyPayment: 15000, monthsLeft: 0, day: null }] }), "base");
    expect(r.rows[0].pdn).toBeCloseTo(0.25, 6);
    expect(pdnLevel(0.25)).toBe("low");
    expect(pdnLevel(0.6)).toBe("elevated");
    expect(pdnLevel(0.9)).toBe("high");
  });

  it("ПДН учитывает рассрочку по решению и падение дохода", () => {
    const m = demoModel("installment");
    expect(simulate(m, "base").rows[1].pdn).toBeCloseTo(10000 / 60000, 6);
    const adv = simulate(m, "adverse");
    expect(adv.rows[1].pdn).toBeCloseTo(10000 / 48000, 6);
    expect(adv.metrics.pdnMax).toBeCloseTo(0.2083, 4);
    expect(adv.metrics.pdnMaxMonth).toBe(2);
  });

  it("без дохода с долгами нагрузка не считается", () => {
    const r = simulate(plain({ income: 0, debts: [{ id: "d", name: "Кредит", kind: "loan", monthlyPayment: 1000, monthsLeft: 0, day: null }] }), "base");
    expect(r.rows[0].pdn).toBeNull();
    expect(pdnLevel(null)).toBe("none");
  });

  it("старые сценарии без долгов и целей проходят проверку", () => {
    const m = demoModel("cash");
    delete m.finances.debts;
    delete m.goals;
    expect(validateModel(m).ok).toBe(true);
  });
});

describe("календарь по дням", () => {
  it("минимум календаря совпадает с самой низкой точкой расчёта", () => {
    const m = plain({ savings: 10000, existingPayments: 20000, minReserve: 0 }, { cashTiming: "payday", payday: 25, paymentDay: 5 });
    const row = simulate(m, "base").rows[0];
    const cal = buildCalendar(row, 0);
    expect(cal.days).toHaveLength(30);
    expect(cal.min).toBeCloseTo(row.lowPoint, 2);
    expect(cal.lowestDay.day).toBe(25);
    expect(cal.days[29].balance).toBeCloseTo(row.end, 2);
  });

  it("у долга может быть свой день списания", () => {
    const m = plain({ debts: [{ id: "d", name: "Кредит", kind: "loan", monthlyPayment: 7000, monthsLeft: 0, day: 12 }] });
    const cal = buildCalendar(simulate(m, "base").rows[0], 0);
    expect(cal.days[11].ops.some((o) => o.label === "Кредит" && o.amount === -7000)).toBe(true);
  });
});

describe("разброс дохода и расходов", () => {
  it("без разброса анализ не строится", () => {
    expect(runRanges(demoModel("installment"), "base")).toBeNull();
  });

  it("воспроизводим при одном зерне, медиана близка к обычному расчёту", () => {
    const m = demoModel("installment");
    m.settings = { ...m.settings!, incomeVarPct: 10, expenseVarPct: 10 };
    const a = runRanges(m, "base", { runs: 400, seed: 1 })!;
    const b = runRanges(m, "base", { runs: 400, seed: 1 })!;
    expect(a.minBalance.p50).toBe(b.minBalance.p50);
    expect(a.fan).toHaveLength(12);
    const baseEnd = simulate(m, "base").metrics.endBalance;
    expect(Math.abs(a.endBalance.p50 - baseEnd) / baseEnd).toBeLessThan(0.05);
    expect(a.minBalance.p5).toBeLessThanOrEqual(a.minBalance.p95);
  });
});

describe("цели", () => {
  it("копятся по порядку сверх запаса", () => {
    const m = plain();
    m.goals = [
      { id: "a", name: "Отпуск", amount: 30000, targetMonth: 1 },
      { id: "b", name: "Курсы", amount: 50000, targetMonth: 2 },
    ];
    // Сверх запаса: мес. 1 — 55 000, мес. 2 — 80 000.
    const g = evaluateGoals(m, simulate(m, "base"));
    expect(g[0]).toMatchObject({ reachedMonth: 1, status: "on_time" });
    expect(g[1]).toMatchObject({ cumulative: 80000, reachedMonth: 2, status: "on_time" });
    m.goals[1].targetMonth = 1;
    expect(evaluateGoals(m, simulate(m, "base"))[1]).toMatchObject({ status: "late", lateBy: 1 });
  });
});

describe("куда уходят деньги", () => {
  it("источники и направления сходятся", () => {
    const m = demoModel("installment");
    m.events.push(makeEvent("new_payment", { value: 2000, month: 1, duration: 12 }));
    const rows = simulate(m, "stress").rows;
    const f = moneyFlows(m, rows);
    const s = f.sources.reduce((a, n) => a + n.value, 0);
    const t = f.sinks.reduce((a, n) => a + n.value, 0);
    expect(s).toBeCloseTo(t, 2);
  });
});

describe("импорт выписки", () => {
  const csv = [
    "Дата операции;Категория;Описание;Сумма операции",
    "01.09.2026;Зарплата;ООО Ромашка;60 000,00",
    "03.09.2026;Супермаркеты;Пятёрочка;-2 500,50",
    "05.09.2026;ЖКХ;Квартплата;-8 000",
    "10.09.2026;Кредиты;Погашение кредита;-5 000",
    "12.09.2026;Переводы;Перевод между своими счетами;-10 000",
    '01.10.2026;Зарплата;"ООО ""Ромашка""";60 000',
    "04.10.2026;Супермаркеты;Пятёрочка;-3 499,50",
  ].join("\n");

  it("разбирает суммы и даты", () => {
    expect(parseAmount("-1 234,56")).toBe(-1234.56);
    expect(parseAmount("1.234,5")).toBe(1234.5);
    expect(parseAmount("−500")).toBe(-500);
    expect(parseDate("31.12.2026")!.getMonth()).toBe(11);
    expect(parseDate("2026-01-05")!.getDate()).toBe(5);
  });

  it("находит колонки и считает средние за месяц", () => {
    const rows = parseCsv(csv);
    expect(rows[6][2]).toBe('ООО "Ромашка"');
    const h = findHeader(rows);
    const map = detectColumns(rows[h]);
    expect(map).toMatchObject({ date: 0, category: 1, description: 2, amount: 3 });
    const sum = summarizeStatement(extractRows(rows, h, map));
    expect(sum.months).toBe(2);
    expect(sum.monthly).toMatchObject({ income: 60000, variable: 3000, fixed: 4000, debt: 2500 });
    expect(sum.totals.skip).toBe(10000);
  });

  it("пользователь может переназначить категорию", () => {
    const rows = parseCsv(csv);
    const h = findHeader(rows);
    const sum = summarizeStatement(extractRows(rows, h, detectColumns(rows[h])), { "− Супермаркеты": "fixed" });
    expect(sum.monthly.fixed).toBe(7000);
    expect(sum.monthly.variable).toBe(0);
  });

  it("понимает кодировку Windows-1251", () => {
    expect(decodeBytes(new Uint8Array([0xc4, 0xe0, 0xf2, 0xe0]).buffer)).toBe("Дата");
  });
});
