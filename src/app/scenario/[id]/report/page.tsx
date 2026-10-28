"use client";

import { useMemo } from "react";
import { Download, Printer } from "lucide-react";
import { FINANCING_LABELS, KIND_META, MODE_META, resolveSettings, serializeScenarios, STATUS_META, effectiveFinancing, evaluateGoals, PDN_META, pdnLevel, type Mode } from "@/lib/engine";
import { buildAnalysis } from "@/lib/explain/context";
import { explainLocally } from "@/lib/explain/local";
import { useWorkspace } from "@/components/workspace/context";
import { BalanceChart, SERIES_COLORS } from "@/components/balance-chart";
import { Button } from "@/components/ui/button";
import { Badge, statusTone } from "@/components/ui/primitives";
import { Logo } from "@/components/logo";
import { downloadText, safeFileName } from "@/lib/download";
import { formatPct, formatRub, fromMonth, pluralMonths } from "@/lib/format";

const MODES: Mode[] = ["base", "adverse", "stress"];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="break-inside-avoid border-t pt-5">
      <h2 className="font-display text-lg font-bold">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export default function ReportPage() {
  const { model, result, scenario } = useWorkspace();
  const a = useMemo(() => buildAnalysis(model, result), [model, result]);
  const ex = useMemo(() => explainLocally(a), [a]);
  const f = model.finances;
  const s = resolveSettings(model.settings);
  const fin = effectiveFinancing(model);
  const bps = a.breakpoints.filter((b) => b.method !== "direct");
  const fmtBp = (v: number | null, unit: string) => (v == null ? "—" : unit === "pct" ? formatPct(v) : unit === "months" ? pluralMonths(v) : unit === "rub_month" ? `${formatRub(v)} в месяц` : formatRub(v));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-end gap-2 print:hidden">
        <Button variant="secondary" size="sm" onClick={() => downloadText(`${safeFileName(scenario.title)}.futurewise.json`, serializeScenarios([{ title: scenario.title, model }]))}>
          <Download /> Сохранить файл
        </Button>
        <Button size="sm" onClick={() => window.print()}>
          <Printer /> Распечатать или PDF
        </Button>
      </div>

      <article className="card space-y-6 p-6 sm:p-8 print:border-0 print:p-0 print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Logo />
            <h1 className="mt-4 font-display text-2xl font-extrabold">{scenario.title}</h1>
            <p className="mt-1 text-sm text-muted">
              Отчёт краш-теста · {KIND_META[model.kind].label} · на {pluralMonths(model.horizon)} · {new Date().toLocaleDateString("ru-RU", { dateStyle: "long" })}
            </p>
          </div>
          {scenario.demo && <Badge tone="violet">демо</Badge>}
        </header>

        <p className="rounded-xl bg-surface-2/60 p-4 text-sm">
          <b>Коротко.</b> {ex.summary} {ex.mainRisk}
        </p>

        <Section title="Ваши данные">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
            {[
              ["Зарплата", `${formatRub(f.income)} в месяц`],
              ["Подработка", `${formatRub(f.extraIncome)} в месяц`],
              ["Обязательные расходы", `${formatRub(f.fixedExpenses)} в месяц`],
              ["Расходы на жизнь", `${formatRub(f.variableExpenses)} в месяц`],
              ["Платежи по кредитам", `${formatRub(f.existingPayments)} в месяц`],
              ["Накоплено", formatRub(f.savings)],
              ["Запас, который не трогаем", formatRub(f.minReserve)],
              ...(fin ? [["Как платите", FINANCING_LABELS[fin]]] : []),
              ...(result.plan.monthlyPayment ? [["Платёж", `${formatRub(result.plan.monthlyPayment)} в месяц, ${pluralMonths(result.plan.termMonths ?? 0)}`]] : []),
              ["Решение обойдётся в", formatRub(result.plan.totalCost)],
              ...(result.plan.psk != null ? [["Полная стоимость кредита", `${formatPct(result.plan.psk)} годовых`]] : []),
              ...((f.debts ?? []).length ? [["Кредиты и рассрочки", (f.debts ?? []).map((d) => `${d.name || "платёж"} ${formatRub(d.monthlyPayment)}${d.monthsLeft ? ` × ${d.monthsLeft}` : ""}`).join("; ")]] : []),
              ["Долговая нагрузка (кризис)", result.modes.stress.metrics.pdnMax == null ? "нет дохода" : `${formatPct(Math.round(result.modes.stress.metrics.pdnMax * 1000) / 10)} — ${PDN_META[pdnLevel(result.modes.stress.metrics.pdnMax)].label.toLowerCase()}`],
              ["Рост цен / зарплаты", `${s.inflationPct}% / ${s.incomeIndexPct}% в год`],
              ["Как считали", s.cashTiming === "payday" ? `по дням (зарплата ${s.payday}-го, платежи ${s.paymentDay}-го)` : "по месяцам"],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-muted">{k}</dt>
                <dd className="num font-medium">{v}</dd>
              </div>
            ))}
          </dl>
          {model.events.some((e) => e.enabled) && (
            <ul className="mt-3 list-disc pl-5 text-sm text-muted">
              {result.eventImpacts.map((i) => {
                const e = model.events.find((x) => x.id === i.eventId)!;
                return (
                  <li key={i.eventId}>
                    {i.label} — {e.tier === "adverse" ? "трудный и кризисный сценарий" : "только кризисный сценарий"}{e.probability != null ? `, вероятность по вашей оценке ${e.probability}%` : ""}
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        <Section title="Что получилось">
          <table className="num w-full text-sm">
            <thead className="text-xs text-muted">
              <tr className="border-b text-right">
                <th className="py-2 text-left font-medium">Сценарий</th>
                <th className="py-2 font-medium">Меньше всего</th>
                <th className="py-2 font-medium">В конце</th>
                <th className="py-2 font-medium">Запас тронут</th>
                <th className="py-2 font-medium">Не хватит денег</th>
                <th className="py-2 text-left font-medium pl-3">Итог</th>
              </tr>
            </thead>
            <tbody>
              {MODES.map((k) => {
                const m = result.modes[k].metrics;
                return (
                  <tr key={k} className="border-b border-border/50 text-right">
                    <td className="py-2 text-left">{MODE_META[k].label}</td>
                    <td className="py-2 font-semibold">
                      {formatRub(m.minBalance)} <span className="text-xs font-normal text-muted">{m.minMonth}-й мес.</span>
                    </td>
                    <td className="py-2">{formatRub(m.endBalance)}</td>
                    <td className="py-2">{m.firstReserveBreachMonth ? fromMonth(m.firstReserveBreachMonth) : "нет"}</td>
                    <td className="py-2">{m.firstDeficitMonth ? fromMonth(m.firstDeficitMonth) : "нет"}</td>
                    <td className="py-2 pl-3 text-left">
                      <Badge tone={statusTone(m.status)}>{STATUS_META[m.status].label}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="mt-4">
            <BalanceChart
              height={260}
              reserve={f.minReserve}
              valueKey={s.cashTiming === "payday" ? "lowPoint" : "end"}
              series={MODES.map((k) => ({ key: k, label: MODE_META[k].label, color: SERIES_COLORS[k], rows: result.modes[k].rows, startBalance: f.savings, dashed: k !== "base" }))}
            />
          </div>
        </Section>

        <Section title="Ваши пределы (кризисный сценарий, запас не трогаем)">
          <ul className="space-y-1.5 text-sm">
            {bps.map((b) => (
              <li key={b.id} className="flex flex-wrap justify-between gap-2 border-b border-border/40 pb-1.5">
                <span>{b.title}</span>
                <span className="num font-semibold">
                  {b.status === "found" ? fmtBp(b.threshold, b.unit) : b.status === "holds_all" ? "предела нет" : "не справиться даже в лучшем случае"}
                  {b.status === "found" && b.current != null && <span className="ml-2 text-xs font-normal text-muted">сейчас {fmtBp(b.current, b.unit)}</span>}
                </span>
              </li>
            ))}
          </ul>
        </Section>

        {a.sensitivity.length > 0 && (
          <Section title="Что сильнее всего влияет (если изменить на 20%, кризисный сценарий)">
            <ul className="space-y-1 text-sm">
              {a.sensitivity.slice(0, 5).map((t) => (
                <li key={t.id} className="flex flex-wrap justify-between gap-2">
                  <span>{t.label}</span>
                  <span className="num text-muted">
                    в самый трудный момент от {formatRub(Math.min(t.low.minBalance, t.high.minBalance))} до {formatRub(Math.max(t.low.minBalance, t.high.minBalance))}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {a.probabilistic && (
          <Section title="С учётом ваших вероятностей">
            <p className="text-sm">
              Запас будет тронут в <b>{formatPct(Math.round(a.probabilistic.pReserveBreach * 1000) / 10)}</b> случаев, денег не хватит — в <b>{formatPct(Math.round(a.probabilistic.pDeficit * 1000) / 10)}</b>. Обычно в самый трудный момент остаётся{" "}
              {formatRub(a.probabilistic.minBalance.p50)}, а в 5% самых плохих случаев — {formatRub(a.probabilistic.minBalance.p5)} или меньше. Считаем, что события не связаны друг с другом; события без вероятности здесь не учтены.
            </p>
          </Section>
        )}

        {(model.goals ?? []).length > 0 && (
          <Section title="Цели">
            <ul className="space-y-1 text-sm">
              {evaluateGoals(model, result.modes.base).map((g, i) => {
                const st = evaluateGoals(model, result.modes.stress)[i];
                return (
                  <li key={g.goal.id} className="flex flex-wrap justify-between gap-2 border-b border-border/40 pb-1">
                    <span>
                      {i + 1}. {g.goal.name || "Цель"} — {formatRub(g.goal.amount)}
                      {g.goal.targetMonth ? `, хотите к ${g.goal.targetMonth}-му месяцу` : ""}
                    </span>
                    <span className="num text-muted">
                      обычно: {g.reachedMonth ? `${g.reachedMonth}-й мес.` : "не успеете"} · в кризис: {st.reachedMonth ? `${st.reachedMonth}-й мес.` : "не успеете"}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Section>
        )}

        <Section title="Другие варианты">
          <table className="num w-full text-sm">
            <thead className="text-xs text-muted">
              <tr className="border-b text-right">
                <th className="py-2 text-left font-medium">Вариант</th>
                <th className="py-2 font-medium">Всего потратите</th>
                <th className="py-2 font-medium">Минимум в кризис</th>
                <th className="py-2 font-medium">Запас цел везде</th>
              </tr>
            </thead>
            <tbody>
              {a.alternatives
                .filter((x) => x.alt.available)
                .map((x) => (
                  <tr key={x.alt.id} className="border-b border-border/50 text-right">
                    <td className="py-2 text-left">
                      {x.alt.title}
                      {x.alt.changes.length > 0 && <div className="text-xs text-muted">{x.alt.changes.join("; ")}</div>}
                    </td>
                    <td className="py-2">{formatRub(x.summary.totalCost)}</td>
                    <td className="py-2">{formatRub(x.summary.minBalance.stress)}</td>
                    <td className="py-2">{x.summary.reserveOkAllModes ? "да" : "нет"}</td>
                  </tr>
                ))}
            </tbody>
          </table>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted">
            {a.tradeoffs.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </Section>

        <Section title="Что мы упростили и чего не знаем">
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
            {[...result.assumptions, ...ex.missing].map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-muted">
            Не финансовый совет и не прогноз.
          </p>
        </Section>
      </article>
    </div>
  );
}
