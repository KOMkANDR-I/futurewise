import { describe, expect, it } from "vitest";
import {
  annuityPayment,
  buildDecisionPlan,
  buildTree,
  compareAlternatives,
  defaultModel,
  demoModel,
  earliestSafeStart,
  findBreakpoints,
  loanSchedule,
  makeEvent,
  runCrashTest,
  simulate,
  simulateWith,
  validateModel,
  type ModelInput,
} from "@/lib/engine";

/** Сценарий без событий и без решения: только доходы и расходы. */
function plain(patch: Partial<ModelInput["finances"]> = {}): ModelInput {
  const m = defaultModel("custom");
  m.decision.oneTimeCost = 0;
  m.decision.monthlyCostDelta = 0;
  m.events = [];
  m.finances = { ...m.finances, ...patch };
  return m;
}

describe("базовый сценарий", () => {
  it("остаток = начало + поступления − расходы − платежи", () => {
    const r = simulate(plain(), "base");
    expect(r.rows).toHaveLength(12);
    expect(r.rows[0].end).toBe(50000 + 60000 - 35000);
    expect(r.rows[11].end).toBe(50000 + 12 * 25000);
    for (const row of r.rows) expect(row.end).toBeCloseTo(row.start + row.inflows - row.outflows, 6);
    // Остаток на начало месяца = остаток на конец предыдущего.
    for (let i = 1; i < r.rows.length; i++) expect(r.rows[i].start).toBe(r.rows[i - 1].end);
    expect(r.metrics.status).toBe("ok");
  });

  it("действующие платежи учитываются один раз", () => {
    const r = simulate(plain({ existingPayments: 5000 }), "base");
    expect(r.rows[0].end).toBe(50000 + 60000 - 35000 - 5000);
    expect(r.rows[0].payments).toBe(5000);
  });
});

describe("отсутствие дохода", () => {
  it("показывает, когда закончатся накопления", () => {
    const r = simulate(plain({ income: 0, savings: 100000, minReserve: 40000 }), "base");
    expect(r.rows.map((x) => x.end).slice(0, 3)).toEqual([65000, 30000, -5000]);
    expect(r.metrics.firstReserveBreachMonth).toBe(2);
    expect(r.metrics.firstDeficitMonth).toBe(3);
    expect(r.metrics.status).toBe("deficit");
    expect(validateModel(plain({ income: 0 })).warnings.some((w) => w.includes("Дохода нет"))).toBe(true);
  });
});

describe("неожиданный крупный расход", () => {
  it("применяется ровно один раз в своём месяце", () => {
    const m = plain();
    const e = makeEvent("unexpected_expense", { value: 70000, month: 2 });
    const r = simulateWith(m, [e]);
    expect(r.rows[1].eventCosts).toBe(70000);
    expect(r.rows.filter((x) => x.eventCosts > 0)).toHaveLength(1);
    expect(r.rows[1].end).toBe(75000 + 25000 - 70000);
    expect(r.metrics.minBalance).toBe(30000);
  });
});

describe("несколько событий в одном месяце", () => {
  it("снижения дохода суммируются, расходы складываются", () => {
    const m = plain();
    const events = [
      makeEvent("income_drop", { value: 20, month: 2, duration: 1 }),
      makeEvent("income_drop", { value: 30, month: 2, duration: 1 }),
      makeEvent("unexpected_expense", { value: 5000, month: 2 }),
      makeEvent("expense_increase", { value: 10, month: 2, duration: 1 }),
    ];
    const r = simulateWith(m, events);
    expect(r.rows[1].income).toBe(30000);
    expect(r.rows[1].eventCosts).toBe(5000 + 3500);
    expect(r.rows[1].end).toBe(75000 + 30000 - 35000 - 8500);
    expect(r.rows[2].income).toBe(60000);
  });

  it("снижение дохода не превышает 100%", () => {
    const r = simulateWith(plain(), [makeEvent("income_drop", { value: 80, month: 1, duration: 1 }), makeEvent("income_drop", { value: 80, month: 1, duration: 1 })]);
    expect(r.rows[0].income).toBe(0);
  });

  it("задержка переносит доход, а не теряет и не дублирует его", () => {
    const r = simulateWith(plain(), [makeEvent("income_delay", { value: 2, month: 3, duration: 1 })]);
    expect(r.rows[2].income).toBe(0);
    expect(r.rows[4].income).toBe(120000);
    expect(r.metrics.endBalance).toBe(simulate(plain(), "base").metrics.endBalance);
  });
});

describe("нулевой остаток и резерв", () => {
  it("нулевой остаток — не дефицит", () => {
    const r = simulate(plain({ income: 35000, savings: 0, minReserve: 0 }), "base");
    expect(r.metrics.minBalance).toBe(0);
    expect(r.metrics.firstDeficitMonth).toBeNull();
    expect(r.metrics.status).toBe("ok");
  });

  it("нарушение минимального резерва без дефицита", () => {
    const r = simulate(plain({ income: 35000, savings: 10000, minReserve: 20000 }), "base");
    expect(r.metrics.status).toBe("reserve");
    expect(r.metrics.firstReserveBreachMonth).toBe(1);
    expect(r.metrics.firstDeficitMonth).toBeNull();
    expect(r.metrics.reserveShortfall).toBe(10000);
  });

  it("отсутствие дефицита: нет искусственной критической точки", () => {
    const res = runCrashTest(demoModel("installment"));
    for (const mode of ["base", "adverse", "stress"] as const) {
      expect(res.modes[mode].metrics.firstDeficitMonth).toBeNull();
      expect(res.modes[mode].metrics.firstReserveBreachMonth).toBeNull();
      expect(res.modes[mode].rows.every((r) => !r.belowReserve)).toBe(true);
    }
  });
});

describe("демосценарий", () => {
  it("рассрочка 10 000 × 9 со следующего месяца", () => {
    const res = runCrashTest(demoModel("installment"));
    const base = res.modes.base.rows.map((r) => r.end);
    expect(base[0]).toBe(75000);
    expect(base[9]).toBe(210000);
    expect(base[11]).toBe(260000);
    expect(res.modes.adverse.rows[1].end).toBe(78000);
    expect(res.modes.stress.rows[2].end).toBe(66000);
    expect(res.plan.totalCost).toBe(90000);
  });

  it("полная оплата сразу даёт дефицит в первом месяце", () => {
    const res = runCrashTest(demoModel("cash"));
    expect(res.modes.base.rows[0].end).toBe(-15000);
    expect(res.modes.base.metrics.firstDeficitMonth).toBe(1);
    expect(res.modes.base.metrics.reserveBreachMonths).toBe(2);
  });

  it("платёж 10 000 ₽ не применяется к полной оплате", () => {
    const plan = buildDecisionPlan(demoModel("cash"));
    expect(plan.monthlyPayment).toBeNull();
    expect(plan.flows).toHaveLength(1);
  });
});

describe("неизменность исходных данных", () => {
  it("расчёты и альтернативы не мутируют модель", () => {
    const m = demoModel("installment");
    const snapshot = JSON.stringify(m);
    runCrashTest(m);
    runCrashTest(m);
    compareAlternatives(m);
    findBreakpoints(m, { mode: "stress", criterion: "reserve" });
    buildTree(m);
    expect(JSON.stringify(m)).toBe(snapshot);
  });

  it("повторный расчёт даёт идентичный результат", () => {
    const m = demoModel("installment");
    expect(JSON.stringify(runCrashTest(m).modes)).toBe(JSON.stringify(runCrashTest(m).modes));
  });
});

describe("сравнение альтернатив", () => {
  it("все варианты на одном горизонте, исходный вариант равен базовому расчёту", () => {
    const m = demoModel("cash");
    const { results, tradeoffs } = compareAlternatives(m);
    const ids = results.map((r) => r.alt.id);
    expect(ids).toEqual(expect.arrayContaining(["original", "cheaper", "defer", "reserve_first"]));
    for (const r of results) expect(r.modes.base.rows).toHaveLength(12);
    const orig = results.find((r) => r.alt.id === "original")!;
    expect(orig.summary.minBalance.base).toBe(runCrashTest(m).modes.base.metrics.minBalance);
    expect(tradeoffs.length).toBeGreaterThan(0);
  });

  it("«сначала резерв» находит самый ранний безопасный месяц", () => {
    const m = demoModel("cash");
    expect(earliestSafeStart(m, "stress")).toBe(4);
    const rf = compareAlternatives(m).results.find((r) => r.alt.id === "reserve_first")!;
    expect(rf.alt.model.decision.startMonth).toBe(4);
    expect(rf.summary.minBalance.stress).toBeGreaterThanOrEqual(20000);
  });

  it("увеличенный срок кредита снижает платёж и увеличивает переплату", () => {
    const m = defaultModel("loan");
    const { results } = compareAlternatives(m);
    const orig = results.find((r) => r.alt.id === "original")!;
    const longer = results.find((r) => r.alt.id === "lower_payment")!;
    expect(longer.summary.monthlyPayment!).toBeLessThan(orig.summary.monthlyPayment!);
    expect(longer.summary.overpayment).toBeGreaterThan(orig.summary.overpayment);
  });
});

describe("поиск точки перелома", () => {
  const m = demoModel("installment");
  const bps = findBreakpoints(m, { mode: "base", criterion: "reserve" });
  const get = (id: string) => bps.find((b) => b.id === id)!;

  it("максимальное снижение дохода (бинарный поиск)", () => {
    // Аналитически: доход I ≥ 41 000 ₽ ⇒ снижение ≤ 31,67% ⇒ на сетке 0,1% — 31,6%.
    const b = get("income_drop");
    expect(b.status).toBe("found");
    expect(b.threshold).toBeCloseTo(31.6, 6);
    expect(b.before!.minBalance).toBeGreaterThanOrEqual(20000);
    expect(b.after!.minBalance).toBeLessThan(20000);
  });

  it("максимальный дополнительный расход", () => {
    const b = get("extra_expense");
    expect(b.threshold).toBe(55000);
    expect(b.after!.minBalance).toBeLessThan(20000);
  });

  it("наибольший допустимый платёж по рассрочке", () => {
    // 75 000 + 9 · (25 000 − x) ≥ 20 000 ⇒ x ≤ 31 111 ⇒ на сетке 100 ₽ — 31 100.
    expect(get("max_payment").threshold).toBe(31100);
  });

  it("месяц первого дефицита при полной оплате", () => {
    const b = findBreakpoints(demoModel("cash"), { mode: "base", criterion: "zero" }).find((x) => x.id === "first_breach")!;
    expect(b.threshold).toBe(1);
  });

  it("если условие выполняется во всём диапазоне — порог не придумывается", () => {
    const rich = demoModel("installment");
    rich.finances.savings = 10_000_000;
    const b = findBreakpoints(rich, { mode: "stress", criterion: "zero" }).find((x) => x.id === "income_drop")!;
    expect(b.status).toBe("holds_all");
  });

  it("минимальный первоначальный взнос (перебор)", () => {
    const loanBuy = defaultModel("purchase");
    loanBuy.decision.financing = "loan";
    loanBuy.decision.price = 400000;
    loanBuy.finances.savings = 150000;
    const b = findBreakpoints(loanBuy, { mode: "base", criterion: "reserve" }).find((x) => x.id === "min_down")!;
    expect(b.method).toBe("scan");
    if (b.status === "found") {
      expect(b.before!.minBalance).toBeGreaterThanOrEqual(20000);
      expect(b.after!.minBalance).toBeLessThan(20000);
    }
  });
});

describe("кредит", () => {
  it("аннуитетный платёж", () => {
    expect(annuityPayment(100000, 12, 12)).toBe(8884.88);
    expect(annuityPayment(120000, 0, 12)).toBe(10000);
  });

  it("график закрывает долг полностью", () => {
    const s = loanSchedule(100000, 12, 12);
    expect(s.remaining).toBe(0);
    expect(s.totalPaid).toBeCloseTo(106618.55, 0);
    expect(s.totalInterest).toBeCloseTo(6618.55, 0);
  });

  it("комиссии учитываются и показываются как учтённые", () => {
    const m = defaultModel("loan");
    m.decision.price = 100000;
    m.decision.loan = { ...m.decision.loan, months: 12, annualRate: 12, oneTimeFees: 2000, monthlyFees: 300 };
    const plan = buildDecisionPlan(m);
    expect(plan.monthlyPayment).toBeCloseTo(8884.88 + 300, 2);
    expect(plan.overpayment).toBeCloseTo(6618.55 + 2000 + 300 * 12, 0);
    expect(plan.unknown).toHaveLength(0);
  });

  it("некорректные ставка и срок не проходят валидацию", () => {
    const m = defaultModel("loan");
    m.decision.loan.annualRate = -5;
    expect(validateModel(m).ok).toBe(false);
    const m2 = defaultModel("loan");
    m2.decision.loan.months = 0;
    expect(validateModel(m2).ok).toBe(false);
    expect(() => annuityPayment(1000, 10, -3)).toThrow();
  });
});

describe("валидация", () => {
  it("отрицательные суммы и пропущенные поля", () => {
    const m = plain();
    (m.finances as any).income = -1;
    expect(validateModel(m).ok).toBe(false);
    const m2 = plain();
    delete (m2.finances as any).savings;
    expect(validateModel(m2).ok).toBe(false);
  });

  it("взнос больше стоимости", () => {
    const m = demoModel("installment");
    m.decision.downPayment = 100000;
    expect(validateModel(m).errors.some((e) => e.path === "decision.downPayment")).toBe(true);
  });
});

describe("дерево последствий", () => {
  it("ветви строятся из событий сценария", () => {
    const m = demoModel("cash");
    const t = buildTree(m);
    expect(t.children.map((c) => c.id)).toEqual(["base", `ev-${m.events[0].id}`, `ev-${m.events[1].id}`, "stress"]);
    const base = t.children[0];
    expect(base.metrics!.minBalance).toBe(runCrashTest(m).modes.base.metrics.minBalance);
    const action = base.children.find((c) => c.kind === "action")!;
    // Мес. 2: 75 000 + 25 000 − 90 000 = 10 000 < резерва; мес. 3: 35 000 ≥ 20 000.
    expect(action.action!.apply).toEqual({ type: "deferTo", month: 3 });
  });
});
