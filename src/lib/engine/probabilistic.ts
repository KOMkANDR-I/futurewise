import { buildDecisionPlan } from "./decision";
import { describeEvent } from "./meta";
import { eventsForMode, simulateWith } from "./simulate";
import type { ModelInput, StressEvent } from "./types";

/**
 * Вероятностный взгляд строится ТОЛЬКО на вероятностях, которые задал пользователь.
 * События без вероятности в расчёт не входят. События считаются независимыми.
 * При ≤ 12 событиях все 2^k комбинаций перебираются точно (без случайности);
 * при большем числе — Монте-Карло с фиксированным зерном (результат воспроизводим).
 */

export interface Quantiles {
  p5: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
}

export interface ProbabilisticResult {
  method: "exact" | "monte_carlo";
  runs: number;
  used: { id: string; label: string; probability: number }[];
  ignored: { id: string; label: string }[];
  /** Доля исходов (с учётом весов), в которых нарушается резерв / возникает дефицит. */
  pReserveBreach: number;
  pDeficit: number;
  pNoEvents: number;
  minBalance: Quantiles;
  endBalance: Quantiles;
  /** Веерный график: квантили остатка (по самой низкой точке месяца) по месяцам. */
  fan: ({ month: number } & Quantiles)[];
  /** Для каждого события: вероятность нарушения резерва, если событие произошло и если нет. */
  conditional: { id: string; label: string; ifHappens: number; ifNot: number }[];
}

/** Детерминированный генератор псевдослучайных чисел (mulberry32). */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Взвешенный квантиль: values и weights одной длины, сумма весов > 0. */
export function weightedQuantile(values: number[], weights: number[], q: number): number {
  const idx = values.map((_, i) => i).sort((a, b) => values[a] - values[b]);
  const total = weights.reduce((a, b) => a + b, 0);
  let acc = 0;
  for (const i of idx) {
    acc += weights[i];
    if (acc / total >= q - 1e-12) return values[i];
  }
  return values[idx[idx.length - 1]];
}

const quantiles = (v: number[], w: number[]): Quantiles => ({
  p5: weightedQuantile(v, w, 0.05),
  p25: weightedQuantile(v, w, 0.25),
  p50: weightedQuantile(v, w, 0.5),
  p75: weightedQuantile(v, w, 0.75),
  p95: weightedQuantile(v, w, 0.95),
});

export function runProbabilistic(model: ModelInput, opts: { maxExact?: number; runs?: number; seed?: number } = {}): ProbabilisticResult | null {
  const { maxExact = 12, runs = 4000, seed = 20261022 } = opts;
  const enabled = model.events.filter((e) => e.enabled);
  const used = enabled.filter((e) => e.probability != null);
  if (!used.length) return null;
  const ignored = enabled.filter((e) => e.probability == null);
  const plan = buildDecisionPlan(model);
  const reserve = model.finances.minReserve;
  const p = used.map((e) => Math.min(1, Math.max(0, (e.probability as number) / 100)));
  const k = used.length;

  const samples: { mask: number[]; weight: number; min: number; end: number; lows: number[] }[] = [];
  const evaluate = (mask: number[], weight: number) => {
    const evs: StressEvent[] = used.filter((_, i) => mask[i]);
    const r = simulateWith(model, evs, plan);
    samples.push({ mask, weight, min: r.metrics.minBalance, end: r.metrics.endBalance, lows: r.rows.map((x) => x.lowPoint) });
  };

  let method: ProbabilisticResult["method"];
  if (k <= maxExact) {
    method = "exact";
    for (let bits = 0; bits < 1 << k; bits++) {
      const mask = used.map((_, i) => (bits >> i) & 1);
      const weight = mask.reduce((w, b, i) => w * (b ? p[i] : 1 - p[i]), 1);
      if (weight > 0) evaluate(mask, weight);
    }
  } else {
    method = "monte_carlo";
    const rnd = mulberry32(seed);
    for (let r = 0; r < runs; r++) evaluate(p.map((pi) => (rnd() < pi ? 1 : 0)), 1);
  }

  const total = samples.reduce((a, s) => a + s.weight, 0);
  const w = samples.map((s) => s.weight);
  const share = (pred: (s: (typeof samples)[number]) => boolean) => samples.filter(pred).reduce((a, s) => a + s.weight, 0) / total;
  const fan = Array.from({ length: model.horizon }, (_, i) => ({ month: i + 1, ...quantiles(samples.map((s) => s.lows[i]), w) }));
  const conditional = used.map((e, i) => {
    const yes = samples.filter((s) => s.mask[i]);
    const no = samples.filter((s) => !s.mask[i]);
    const rate = (arr: typeof samples) => {
      const t = arr.reduce((a, s) => a + s.weight, 0);
      return t > 0 ? arr.filter((s) => s.min < reserve).reduce((a, s) => a + s.weight, 0) / t : 0;
    };
    return { id: e.id, label: describeEvent(e), ifHappens: rate(yes), ifNot: rate(no) };
  });

  return {
    method,
    runs: samples.length,
    used: used.map((e, i) => ({ id: e.id, label: describeEvent(e), probability: p[i] * 100 })),
    ignored: ignored.map((e) => ({ id: e.id, label: describeEvent(e) })),
    pReserveBreach: share((s) => s.min < reserve),
    pDeficit: share((s) => s.min < 0),
    pNoEvents: share((s) => s.mask.every((b) => !b)),
    minBalance: quantiles(samples.map((s) => s.min), w),
    endBalance: quantiles(samples.map((s) => s.end), w),
    fan,
    conditional,
  };
}

/* ───────────── Разброс: доход и расходы «плавают» в заданных пользователем пределах ───────────── */

export interface RangeResult {
  runs: number;
  incomeVarPct: number;
  expenseVarPct: number;
  pReserveBreach: number;
  pDeficit: number;
  minBalance: Quantiles;
  endBalance: Quantiles;
  fan: ({ month: number } & Quantiles)[];
}

/**
 * Каждый месяц доход и обычные расходы независимо отклоняются от введённых значений
 * равномерно в пределах ±incomeVarPct и ±expenseVarPct. События выбранного сценария происходят всегда.
 * Это не статистика: форма разброса (равномерный) — наше допущение, а его ширину задаёт пользователь.
 */
export function runRanges(model: ModelInput, mode: "base" | "adverse" | "stress", opts: { runs?: number; seed?: number } = {}): RangeResult | null {
  const s = model.settings;
  const iv = Math.max(0, s?.incomeVarPct ?? 0);
  const ev = Math.max(0, s?.expenseVarPct ?? 0);
  if (iv === 0 && ev === 0) return null;
  const { runs = 1000, seed = 20261027 } = opts;
  const rnd = mulberry32(seed);
  const plan = buildDecisionPlan(model);
  const events = eventsForMode(model.events, mode);
  const H = model.horizon;
  const mins: number[] = [];
  const ends: number[] = [];
  const lows: number[][] = Array.from({ length: H }, () => []);
  let breach = 0;
  let deficit = 0;
  for (let r = 0; r < runs; r++) {
    const income = [0];
    const expenses = [0];
    for (let m = 1; m <= H; m++) {
      income.push(1 + (rnd() * 2 - 1) * (iv / 100));
      expenses.push(1 + (rnd() * 2 - 1) * (ev / 100));
    }
    const res = simulateWith(model, events, plan, { income, expenses });
    mins.push(res.metrics.minBalance);
    ends.push(res.metrics.endBalance);
    res.rows.forEach((row, i) => lows[i].push(row.lowPoint));
    if (res.metrics.minBalance < model.finances.minReserve) breach++;
    if (res.metrics.minBalance < 0) deficit++;
  }
  const w = new Array(runs).fill(1);
  return {
    runs,
    incomeVarPct: iv,
    expenseVarPct: ev,
    pReserveBreach: breach / runs,
    pDeficit: deficit / runs,
    minBalance: quantiles(mins, w),
    endBalance: quantiles(ends, w),
    fan: lows.map((l, i) => ({ month: i + 1, ...quantiles(l, w) })),
  };
}
