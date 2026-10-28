import { describeEvent, MODE_META, type Mode } from "@/lib/engine";
import { formatPct, formatRub, fromMonth, inMonth, pluralMonths } from "@/lib/format";
import type { AnalysisContext } from "./context";

export interface Explanation {
  summary: string;
  mainRisk: string;
  factors: string[];
  breakpoint: string[];
  suggestions: string[];
  missing: string[];
  facts: string[];
  assumptions: string[];
}

const MODES: Mode[] = ["base", "adverse", "stress"];

function firstBrokenMode(ctx: AnalysisContext): Mode | null {
  return MODES.find((m) => ctx.result.modes[m].metrics.status !== "ok") ?? null;
}

function modeEventsText(ctx: AnalysisContext, mode: Mode) {
  const ev = ctx.model.events.filter((e) => e.enabled && (mode === "stress" || e.tier === "adverse"));
  return ev.map((e) => describeEvent(e).toLowerCase()).join("; ");
}

const pct1 = (x: number) => formatPct(Math.round(x * 1000) / 10);

export function explainLocally(ctx: AnalysisContext): Explanation {
  const { result, model } = ctx;
  const reserve = model.finances.minReserve;
  const broken = firstBrokenMode(ctx);
  const m = (k: Mode) => result.modes[k].metrics;

  let summary: string;
  if (broken == null) {
    summary = `Хорошая новость: при ваших условиях денег ни разу не становится меньше запаса (${formatRub(reserve)}) — даже в кризисном сценарии. В самый трудный момент у вас остаётся ${formatRub(m("stress").minBalance)} (${m("stress").minMonth}-й месяц).`;
  } else if (broken === "base") {
    const b = m("base");
    summary =
      b.status === "deficit"
        ? `Денег не хватит даже если всё пойдёт по плану: ${inMonth(b.firstDeficitMonth!)} баланс уходит в минус, до ${formatRub(b.minBalance)}.`
        : `Даже если всё пойдёт по плану, ${inMonth(b.firstReserveBreachMonth!)} денег станет меньше вашего запаса (${formatRub(reserve)}): останется ${formatRub(b.minBalance)}. В минус вы при этом не уходите.`;
  } else {
    const x = m(broken);
    summary = `Если всё пойдёт по плану, вы справляетесь. Но ${MODE_META[broken].where} (${modeEventsText(ctx, broken)}) ${
      x.status === "deficit" ? `${inMonth(x.firstDeficitMonth!)} денег не хватит — баланс уйдёт в минус, до ${formatRub(x.minBalance)}` : `${inMonth(x.firstReserveBreachMonth!)} денег станет меньше запаса — останется ${formatRub(x.minBalance)}`
    }.`;
  }

  // Главная причина: событие, которое сильнее всего бьёт по бюджету, или само решение.
  const impacts = [...result.eventImpacts].sort((a, b) => a.minBalanceDelta - b.minBalanceDelta);
  let mainRisk: string;
  if (broken === "base" && result.plan.totalCost > 0) {
    mainRisk = `Главная причина — само решение: ${(result.plan.considered[0] ?? "траты на решение").toLowerCase()}. Даже без неприятностей накоплений и того, что остаётся каждый месяц, не хватает, чтобы сохранить запас.`;
  } else if (impacts.length && impacts[0].minBalanceDelta < 0) {
    mainRisk = `Сильнее всего бьёт событие «${impacts[0].label}»: само по себе оно уменьшает деньги в самый трудный момент на ${formatRub(-impacts[0].minBalanceDelta)}.`;
  } else if (broken == null) {
    mainRisk = m("stress").minBalance < m("base").minBalance
      ? `По отдельности события вас почти не задевают, а все вместе забирают ${formatRub(m("base").minBalance - m("stress").minBalance)} — но запас всё равно остаётся цел.`
      : "Добавленные события вас почти не задевают.";
  } else {
    mainRisk = "Добавленные события почти не влияют на результат — главное здесь само решение.";
  }

  const f = model.finances;
  const net = f.income + f.extraIncome - f.fixedExpenses - f.variableExpenses - f.existingPayments;
  const factors = [
    `Каждый месяц до решения у вас остаётся ${formatRub(net)}: доходы ${formatRub(f.income + f.extraIncome)} минус расходы и платежи ${formatRub(f.fixedExpenses + f.variableExpenses + f.existingPayments)}.`,
    `Накоплений ${formatRub(f.savings)}, из них сверх запаса — ${formatRub(f.savings - reserve)}.`,
  ];
  if (result.plan.totalCost > 0)
    factors.push(
      `Решение обойдётся в ${formatRub(result.plan.totalCost)}${result.plan.monthlyPayment ? `, платёж ${formatRub(result.plan.monthlyPayment)} в месяц, ${pluralMonths(result.plan.termMonths ?? 0)}` : ""}${result.plan.overpayment > 0 ? `, переплата ${formatRub(result.plan.overpayment)}` : ""}.`,
    );
  const pdn = m("stress").pdnMax;
  if (pdn != null && pdn > 0)
    factors.push(`На кредиты и рассрочки в самый тяжёлый месяц уходит ${formatPct(Math.round(pdn * 1000) / 10)} дохода (кризисный сценарий).${pdn > 0.5 ? " Это больше 50% — банки неохотно дают новые кредиты при такой нагрузке." : ""}`);
  if (result.plan.psk != null) factors.push(`Полная стоимость кредита — ${formatPct(result.plan.psk)} годовых: это ставка вместе со всеми комиссиями и страховкой, которые вы указали.`);
  for (const i of impacts.slice(0, 3)) if (i.minBalanceDelta < 0) factors.push(`«${i.label}» забирает в самый трудный момент ${formatRub(-i.minBalanceDelta)}.`);
  const top = ctx.sensitivity[0];
  if (top && top.spread > 0)
    factors.push(
      `Сильнее всего на результат влияет «${top.label.toLowerCase()}»: если изменить это на 20% в любую сторону, в самый трудный момент у вас будет от ${formatRub(Math.min(top.low.minBalance, top.high.minBalance))} до ${formatRub(Math.max(top.low.minBalance, top.high.minBalance))} (кризисный сценарий).`,
    );

  const breakpoint: string[] = [];
  for (const b of ctx.breakpoints) {
    if (b.id === "income_drop") {
      if (b.status === "found") breakpoint.push(`В кризисном сценарии доход может упасть ещё максимум на ${formatPct(b.threshold!)} — если сильнее, запас будет тронут.`);
      else if (b.status === "holds_all") breakpoint.push("Даже если основной доход пропадёт совсем, запас останется цел — накоплений хватает.");
      else breakpoint.push("В кризисном сценарии запас тронут уже без дополнительного падения дохода, поэтому предела по доходу нет.");
    }
    if (b.id === "extra_expense" && b.status === "found")
      breakpoint.push(`Если в 1-м месяце придётся непредвиденно потратить больше ${formatRub(b.threshold!)}, запас будет тронут. Это разница между самым трудным моментом и вашим запасом.`);
    if (b.id === "max_payment" && b.status === "found" && b.current)
      breakpoint.push(`Платёж может вырасти до ${formatRub(b.threshold!)} в месяц (сейчас ${formatRub(b.current)}) — если больше, запас будет тронут.`);
    if (b.id === "max_payment" && b.status === "broken") breakpoint.push("Запас будет тронут даже без платежа — дело не в его размере, а в других параметрах.");
  }
  if (!breakpoint.length) breakpoint.push("Пределы посчитаны на вкладке «Точка перелома».");

  const avail = ctx.alternatives.filter((a) => a.alt.available && a.alt.id !== "original");
  const ok = avail.filter((a) => a.summary.reserveOkAllModes);
  const suggestions =
    broken == null
      ? ["Решение выдерживает все три сценария. Можно проверить его жёстче: добавить событие или увеличить его размер."]
      : (ok.length ? ok : [...avail].sort((a, b) => b.summary.minBalance.stress - a.summary.minBalance.stress).slice(0, 3)).slice(0, 3).map(
          (a) =>
            `Попробуйте вариант «${a.alt.title}»${a.alt.changes.length ? ` (${a.alt.changes.join("; ")})` : ""}: в кризисном сценарии в самый трудный момент останется ${formatRub(a.summary.minBalance.stress)}${a.summary.reserveOkAllModes ? " — и запас цел во всех сценариях" : ""}.`,
        );

  const missing = [...result.plan.unknown];
  if (model.events.some((e) => e.enabled && e.probability == null)) missing.push("Вероятности событий не указаны, поэтому мы только проверяем «что будет, если», а не оцениваем, насколько это вероятно.");
  if (!model.events.some((e) => e.enabled)) missing.push("Вы не добавили ни одного события — трудный и кризисный сценарии совпадают с обычным.");
  missing.push(...result.validation.warnings, ...result.plan.warnings);

  const facts = MODES.map((k) => `${MODE_META[k].label} сценарий: в самый трудный момент ${formatRub(m(k).minBalance)} (${m(k).minMonth}-й месяц), в конце — ${formatRub(m(k).endBalance)}.`);

  return { summary, mainRisk, factors, breakpoint, suggestions, missing, facts, assumptions: result.assumptions };
}

const TAIL = "\n\nЭто расчёт по вашим данным, а не прогноз будущего.";

/** Ответ на вопрос без внешнего API: распознаём тему и отвечаем только рассчитанными значениями. */
export function answerLocally(question: string, ctx: AnalysisContext): string {
  const q = question.toLowerCase();
  const ex = explainLocally(ctx);
  const bp = (id: string) => ctx.breakpoints.find((b) => b.id === id);
  const alt = (id: string) => ctx.alternatives.find((a) => a.alt.id === id);
  const m = ctx.result.modes;
  const reserve = ctx.model.finances.minReserve;

  if (/нагрузк|пдн|долг/.test(q)) {
    const lines = MODES.map((k) => {
      const p = m[k].metrics.pdnMax;
      return `${MODE_META[k].label} сценарий: ${p == null ? "дохода нет — нагрузку не посчитать" : `до ${formatPct(Math.round(p * 1000) / 10)} дохода уходит на долги${m[k].metrics.pdnMaxMonth ? ` (${m[k].metrics.pdnMaxMonth}-й месяц)` : ""}`}.`;
    });
    return `${lines.join("\n")}\n\nОриентиры ЦБ: выше 50% — высокая нагрузка, выше 80% — очень высокая. Это не решение банка, а подсказка, как вас может увидеть банк.${TAIL}`;
  }
  if (/чувствит|влия|больше всего/.test(q)) {
    const list = ctx.sensitivity.slice(0, 4).map((s) => `${s.label}: если на 20% меньше — ${formatRub(s.low.minBalance)}, если на 20% больше — ${formatRub(s.high.minBalance)}`);
    return (list.length ? `Вот что сильнее всего влияет на деньги в самый трудный момент (кризисный сценарий):\n• ${list.join("\n• ")}` : "Ничего заметно не влияет на результат.") + TAIL;
  }
  if (/вероятн|шанс/.test(q)) {
    const withP = ctx.model.events.filter((e) => e.enabled && e.probability != null);
    const pr = ctx.probabilistic;
    return (
      (withP.length && pr
        ? `Вы указали вероятности: ${withP.map((e) => `${describeEvent(e).toLowerCase()} — ${e.probability}%`).join("; ")}. Если считать, что события не связаны друг с другом, запас будет тронут в ${pct1(pr.pReserveBreach)} случаев, а денег не хватит в ${pct1(pr.pDeficit)}. Это следует из ваших же вероятностей — своей статистики у нас нет.${pr.ignored.length ? ` События без вероятности (${pr.ignored.length}) здесь не учитываются.` : ""}`
        : "Вероятности событий не указаны, поэтому мы не говорим, насколько они вероятны, — только что будет, если они случатся.") + TAIL
    );
  }
  if (/почему|причин|из-за/.test(q)) return `${ex.mainRisk}\n\nЧто важно:\n• ${ex.factors.join("\n• ")}${TAIL}`;
  if (/отлож|подожд|позже|перенес/.test(q)) {
    const d = alt("defer");
    const rf = alt("reserve_first");
    const parts: string[] = [];
    if (d?.alt.available) parts.push(`Если подождать 3 месяца, в кризисном сценарии в самый трудный момент останется ${formatRub(d.summary.minBalance.stress)} (сейчас ${formatRub(m.stress.metrics.minBalance)}).`);
    if (rf) parts.push(rf.alt.available ? `Самый ранний месяц, когда запас останется цел даже в кризис, — ${rf.alt.model.decision.startMonth}-й.` : rf.alt.unavailableReason ?? "");
    return (parts.join("\n") || "Для такого решения ожидание не считается.") + TAIL;
  }
  if (/плат[её]ж|рассроч/.test(q)) {
    const b = bp("max_payment");
    const p = ctx.result.plan;
    return (
      `${p.monthlyPayment ? `Сейчас платёж — ${formatRub(p.monthlyPayment)} в месяц, ${pluralMonths(p.termMonths ?? 0)}.` : "Ежемесячного платежа по этому решению нет."} ${
        b?.status === "found" ? `Самый большой платёж, при котором запас останется цел даже в кризис, — ${formatRub(b.threshold!)} в месяц.` : b?.status === "holds_all" ? "Запас цел при любом платеже из проверенных." : "Запас будет тронут даже без платежа."
      }` + TAIL
    );
  }
  if (/доход|зарплат|заработ/.test(q)) {
    const b = bp("income_drop");
    return (
      (b?.status === "found"
        ? `Даже в кризисном сценарии доход может упасть ещё на ${formatPct(b.threshold!)} — и запас останется цел. Если сильнее (${formatPct(b.threshold! + 0.1)}), в самый трудный момент останется ${formatRub(b.after!.minBalance)}.`
        : b?.status === "holds_all"
          ? "Запас останется цел, даже если основной доход пропадёт совсем."
          : "Запас будет тронут и без падения дохода.") + TAIL
    );
  }
  if (/дешев|цен|стоим|сумм/.test(q)) {
    const b = bp("max_price");
    const c = alt("cheaper");
    return (
      [
        b?.status === "found" ? `Самая дорогая покупка, при которой запас останется цел даже в кризис, — ${formatRub(b.threshold!)} (сейчас ${formatRub(b.current!)}).` : null,
        c ? `Если взять на 25% дешевле, в кризисном сценарии в самый трудный момент останется ${formatRub(c.summary.minBalance.stress)}.` : null,
      ]
        .filter(Boolean)
        .join("\n") || "Для такого решения цена не задаётся."
    ) + TAIL;
  }
  if (/кредит|ставк|процент|переплат/.test(q)) {
    const p = ctx.result.plan;
    return (p.overpayment > 0 ? `Переплата — ${formatRub(p.overpayment)}, всего заплатите ${formatRub(p.totalCost)}. Что учли: ${p.considered.join("; ")}.${p.unknown.length ? ` Чего не знаем: ${p.unknown.join("; ")}.` : ""}` : "Переплаты нет.") + TAIL;
  }
  if (/резерв|запас|подушк/.test(q)) {
    const lines = MODES.map(
      (k) => `${MODE_META[k].label} сценарий: ${m[k].metrics.firstReserveBreachMonth ? `запас тронут ${fromMonth(m[k].metrics.firstReserveBreachMonth!)}, не хватает ${formatRub(m[k].metrics.reserveShortfall)}` : `запас ${formatRub(reserve)} цел`}.`,
    );
    return lines.join("\n") + TAIL;
  }
  if (/дефицит|минус|не хват|кончат|законч/.test(q)) {
    const lines = MODES.map(
      (k) => `${MODE_META[k].label} сценарий: ${m[k].metrics.firstDeficitMonth ? `денег не хватит ${inMonth(m[k].metrics.firstDeficitMonth!)}, минус до ${formatRub(m[k].metrics.minBalance)}` : "денег хватает"}.`,
    );
    return lines.join("\n") + TAIL;
  }
  if (/данн|неизвест|не хватает данных|точн/.test(q)) return `Чего мы не знаем и что пришлось предположить:\n• ${ex.missing.join("\n• ") || "Серьёзных пробелов нет."}${TAIL}`;
  if (/что делать|совет|вариант|альтернатив|как улучш|как снизить/.test(q)) return `Что можно попробовать:\n• ${ex.suggestions.join("\n• ")}\n\n${ctx.tradeoffs.join(" ")}${TAIL}`;
  return `${ex.summary}\n\nМожно спросить, например: «Почему так получилось?», «Какой платёж я потяну?», «Что, если подождать?», «Насколько может упасть доход?», «Чего не хватает в данных?».${TAIL}`;
}
