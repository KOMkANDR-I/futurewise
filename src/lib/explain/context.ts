import {
  compareAlternatives,
  describeEvent,
  findBreakpoints,
  MODE_META,
  runCrashTest,
  runProbabilistic,
  tornado,
  type AlternativeResult,
  type Breakpoint,
  type CrashTestResult,
  type ModelInput,
  type ProbabilisticResult,
  type SensitivityItem,
} from "@/lib/engine";

export interface AnalysisContext {
  model: ModelInput;
  result: CrashTestResult;
  breakpoints: Breakpoint[];
  alternatives: AlternativeResult[];
  tradeoffs: string[];
  /** null — пользователь не задал ни одной вероятности. */
  probabilistic: ProbabilisticResult | null;
  /** Чувствительность минимального остатка в стрессовом режиме к сдвигу параметров на ±20%. */
  sensitivity: SensitivityItem[];
}

export function buildAnalysis(model: ModelInput, result: CrashTestResult = runCrashTest(model)): AnalysisContext {
  const breakpoints = findBreakpoints(model, { mode: "stress", criterion: "reserve" });
  const { results, tradeoffs } = compareAlternatives(model);
  return {
    model,
    result,
    breakpoints,
    alternatives: results,
    tradeoffs,
    probabilistic: runProbabilistic(model),
    sensitivity: tornado(model, "stress", 20),
  };
}

const r0 = (x: number) => Math.round(x);

/**
 * Структурированный объект для языковой модели: только параметры и рассчитанные показатели.
 * Название сценария и любые свободные тексты пользователя не передаются.
 */
export function buildAiPayload(ctx: AnalysisContext) {
  const { model, result } = ctx;
  const modes = (["base", "adverse", "stress"] as const).map((m) => {
    const s = result.modes[m];
    return {
      mode: m,
      label: MODE_META[m].label,
      minBalance: r0(s.metrics.minBalance),
      minMonth: s.metrics.minMonth,
      endBalance: r0(s.metrics.endBalance),
      firstReserveBreachMonth: s.metrics.firstReserveBreachMonth,
      firstDeficitMonth: s.metrics.firstDeficitMonth,
      status: s.metrics.status,
      debtBurdenMaxPct: s.metrics.pdnMax == null ? "нет дохода" : Math.round(s.metrics.pdnMax * 1000) / 10,
      debtBurdenMaxMonth: s.metrics.pdnMaxMonth,
      monthlyEndBalances: s.rows.map((r) => r0(r.end)),
    };
  });
  return {
    disclaimer: "Все числа рассчитаны детерминированной моделью FUTUREWISE. Это условные сценарии, а не прогноз.",
    scenario: {
      kind: model.kind,
      horizonMonths: model.horizon,
      finances: model.finances,
      decision: {
        considered: result.plan.considered,
        unknown: result.plan.unknown,
        monthlyPayment: result.plan.monthlyPayment,
        termMonths: result.plan.termMonths,
        totalCost: r0(result.plan.totalCost),
        overpayment: r0(result.plan.overpayment),
        acquireMonth: result.plan.acquireMonth,
        fullLoanCostPct: result.plan.psk,
        interestSavedByEarlyRepayment: r0(result.plan.interestSaved),
      },
      debts: (model.finances.debts ?? []).map((d) => ({ kind: d.kind, monthlyPayment: d.monthlyPayment, monthsLeft: d.monthsLeft || "без срока" })),
      goals: (model.goals ?? []).map((g) => ({ amount: g.amount, targetMonth: g.targetMonth })),
      events: model.events
        .filter((e) => e.enabled)
        .map((e) => ({ description: describeEvent(e), tier: e.tier, probabilityPct: e.probability ?? "не задана (режим «что, если»)" })),
    },
    results: modes,
    eventImpacts: result.eventImpacts.map((i) => ({ event: i.label, minBalanceDelta: r0(i.minBalanceDelta) })),
    breakpoints: ctx.breakpoints.map((b) => ({
      title: b.title,
      status: b.status,
      current: b.current,
      threshold: b.threshold,
      unit: b.unit,
      method: b.method,
      assumptions: b.assumptions,
    })),
    alternatives: ctx.alternatives
      .filter((a) => a.alt.available)
      .map((a) => ({
        title: a.alt.title,
        changes: a.alt.changes,
        totalCost: r0(a.summary.totalCost),
        minBalanceByMode: a.summary.minBalance,
        reserveOkAllModes: a.summary.reserveOkAllModes,
      })),
    tradeoffs: ctx.tradeoffs,
    sensitivity: ctx.sensitivity.slice(0, 5).map((s) => ({
      parameter: s.label,
      shiftPct: 20,
      minBalanceAtMinus20: r0(s.low.minBalance),
      minBalanceAtPlus20: r0(s.high.minBalance),
    })),
    probabilistic: ctx.probabilistic
      ? {
          note: "Только на вероятностях, заданных пользователем; события независимы.",
          method: ctx.probabilistic.method,
          shareOfOutcomesWithReserveBreach: Math.round(ctx.probabilistic.pReserveBreach * 1000) / 10,
          shareOfOutcomesWithDeficit: Math.round(ctx.probabilistic.pDeficit * 1000) / 10,
          minBalanceMedian: r0(ctx.probabilistic.minBalance.p50),
          minBalanceWorst5pct: r0(ctx.probabilistic.minBalance.p5),
          eventsWithoutProbability: ctx.probabilistic.ignored.map((i) => i.label),
        }
      : "вероятности не заданы — вероятностная оценка не строится",
    assumptions: result.assumptions,
    warnings: [...result.validation.warnings, ...result.plan.warnings],
    rules: {
      statusScale: "ok — минимальный остаток ≥ резерва; reserve — 0 ≤ минимум < резерва; deficit — минимум < 0. Это условная шкала, не кредитный рейтинг.",
      debtBurden: "Долговая нагрузка (ПДН) = платежи по долгам / доход. Ориентиры ЦБ: 50% и 80%. Это не решение банка о выдаче кредита.",
    },
  };
}

export type AiPayload = ReturnType<typeof buildAiPayload>;
