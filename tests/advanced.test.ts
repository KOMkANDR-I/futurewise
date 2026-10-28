import { describe, expect, it } from "vitest";
import {
  defaultModel,
  demoModel,
  makeEvent,
  parseScenarios,
  runProbabilistic,
  serializeScenarios,
  simulate,
  stabilityMap,
  tornado,
  validateModel,
  weightedQuantile,
  type ModelInput,
} from "@/lib/engine";

function plain(patch: Partial<ModelInput["finances"]> = {}, settings: Partial<NonNullable<ModelInput["settings"]>> = {}): ModelInput {
  const m = defaultModel("custom");
  m.decision.oneTimeCost = 0;
  m.events = [];
  m.finances = { ...m.finances, ...patch };
  m.settings = { ...m.settings!, ...settings };
  return m;
}

describe("расширенные допущения", () => {
  it("инфляция растит регулярные расходы помесячно сложным процентом", () => {
    const r = simulate(plain({}, { inflationPct: 12 }), "base");
    expect(r.rows[0].expenses).toBe(35000);
    expect(r.rows[11].expenses).toBeCloseTo(35000 * Math.pow(1.12, 11 / 12), 1);
  });

  it("индексация дохода и фиксированные платежи", () => {
    const r = simulate(plain({ existingPayments: 5000 }, { incomeIndexPct: 10, inflationPct: 10 }), "base");
    expect(r.rows[11].income).toBeCloseTo(60000 * Math.pow(1.1, 11 / 12), 1);
    expect(r.rows[11].payments).toBe(5000);
  });

  it("проценты на положительный остаток", () => {
    const r = simulate(plain({}, { savingsRatePct: 12 }), "base");
    expect(r.rows[0].interest).toBe(500);
    expect(r.rows[0].end).toBe(75500);
  });

  it("проценты не начисляются на отрицательный остаток", () => {
    const r = simulate(plain({ savings: -0, income: 0 }, { savingsRatePct: 12 }), "base");
    expect(r.rows.every((x) => x.start > 0 || x.interest === 0)).toBe(true);
  });

  it("дневная модель находит кассовый разрыв, невидимый на конец месяца", () => {
    // Накопления 10 000, платежи 20 000 5-го числа, зарплата 60 000 25-го, расходы 35 000 равномерно.
    const monthly = simulate(plain({ savings: 10000, existingPayments: 20000, minReserve: 0 }), "base");
    expect(monthly.rows[0].end).toBe(15000);
    expect(monthly.metrics.status).toBe("ok");
    const daily = simulate(plain({ savings: 10000, existingPayments: 20000, minReserve: 0 }, { cashTiming: "payday", payday: 25, paymentDay: 5 }), "base");
    expect(daily.rows[0].end).toBe(15000); // конец месяца не меняется
    // В день зарплаты списание идёт раньше поступления: 10 000 − 25 · 35 000/30 − 20 000.
    expect(daily.rows[0].lowPoint).toBeCloseTo(10000 - (25 * 35000) / 30 - 20000, 2);
    expect(daily.metrics.status).toBe("deficit");
    expect(daily.metrics.firstDeficitMonth).toBe(1);
  });

  it("старые сценарии без settings остаются валидными", () => {
    const m = demoModel("installment");
    delete m.settings;
    expect(validateModel(m).ok).toBe(true);
    expect(simulate(m, "base").rows[0].end).toBe(75000);
  });

  it("некорректный день зарплаты не проходит валидацию", () => {
    const m = plain({}, { payday: 31 });
    expect(validateModel(m).ok).toBe(false);
  });
});

describe("вероятностный взгляд", () => {
  const model = () => {
    const m = plain({ savings: 20000, minReserve: 20000 });
    m.events = [
      makeEvent("unexpected_expense", { value: 30000, month: 1, probability: 25 }),
      makeEvent("unexpected_expense", { value: 1000, month: 2, probability: 50 }),
      makeEvent("income_drop", { value: 90, month: 1, duration: 1, probability: null }),
    ];
    return m;
  };

  it("точный перебор комбинаций по вероятностям пользователя", () => {
    const r = runProbabilistic(model())!;
    expect(r.method).toBe("exact");
    expect(r.runs).toBe(4);
    expect(r.pReserveBreach).toBeCloseTo(0.25, 10);
    expect(r.pNoEvents).toBeCloseTo(0.375, 10);
    expect(r.conditional[0].ifHappens).toBe(1);
    expect(r.conditional[0].ifNot).toBe(0);
  });

  it("события без вероятности не участвуют и перечисляются отдельно", () => {
    const r = runProbabilistic(model())!;
    expect(r.used).toHaveLength(2);
    expect(r.ignored).toHaveLength(1);
  });

  it("без заданных вероятностей результат не строится", () => {
    expect(runProbabilistic(demoModel("installment"))).toBeNull();
  });

  it("Монте-Карло воспроизводим при одном зерне и близок к точному", () => {
    const a = runProbabilistic(model(), { maxExact: 0, runs: 3000, seed: 7 })!;
    const b = runProbabilistic(model(), { maxExact: 0, runs: 3000, seed: 7 })!;
    expect(a.method).toBe("monte_carlo");
    expect(a.pReserveBreach).toBe(b.pReserveBreach);
    expect(Math.abs(a.pReserveBreach - 0.25)).toBeLessThan(0.04);
  });

  it("взвешенный квантиль", () => {
    expect(weightedQuantile([10, 20, 30], [1, 1, 2], 0.5)).toBe(20);
    expect(weightedQuantile([10, 20, 30], [1, 1, 2], 0.9)).toBe(30);
  });
});

describe("чувствительность", () => {
  it("торнадо сортирует параметры по влиянию и не меняет модель", () => {
    const m = demoModel("cash");
    const snap = JSON.stringify(m);
    const t = tornado(m, "base", 20);
    expect(t[0].id).toBe("price"); // разброс 36 000 ₽ — больше, чем у дохода (24 000 ₽)
    const income = t.find((x) => x.id === "income")!;
    expect(income.low.minBalance).toBe(-27000);
    expect(income.high.minBalance).toBe(-3000);
    for (let i = 1; i < t.length; i++) expect(t[i - 1].spread).toBeGreaterThanOrEqual(t[i].spread);
    expect(JSON.stringify(m)).toBe(snap);
  });

  it("клетка карты в текущей точке совпадает с основным расчётом", () => {
    const m = demoModel("installment");
    const map = stabilityMap(m, "stress", "income_drop", "savings", 11);
    expect(map.xs[0]).toBe(0);
    expect(map.ys[5]).toBe(50000);
    expect(map.cells[5][0].minBalance).toBe(simulate(m, "stress").metrics.minBalance);
    // Больше снижение дохода — не выше минимальный остаток.
    const row = map.cells[5].map((c) => c.minBalance);
    for (let i = 1; i < row.length; i++) expect(row[i]).toBeLessThanOrEqual(row[i - 1]);
  });
});

describe("экспорт и импорт", () => {
  it("круговой перенос сохраняет модель", () => {
    const m = demoModel("installment");
    const parsed = parseScenarios(serializeScenarios([{ title: "Ноутбук", model: m }]));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.items[0].model).toEqual(m);
  });

  it("чужие и повреждённые файлы отклоняются", () => {
    expect(parseScenarios("{oops").ok).toBe(false);
    expect(parseScenarios(JSON.stringify({ format: "other", version: 1, items: [] })).ok).toBe(false);
    const bad = JSON.parse(serializeScenarios([{ title: "x", model: demoModel("cash") }]));
    bad.items[0].model.finances.income = -5;
    expect(parseScenarios(JSON.stringify(bad)).ok).toBe(false);
  });
});
