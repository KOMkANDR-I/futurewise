"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Maximize2, Play } from "lucide-react";
import { compareAlternatives, demoModel, findBreakpoints, MODE_META, runCrashTest, stabilityMap, STATUS_META, type Mode } from "@/lib/engine";
import { BalanceChart, SERIES_COLORS } from "@/components/balance-chart";
import { Button } from "@/components/ui/button";
import { Badge, statusTone } from "@/components/ui/primitives";
import { Logo } from "@/components/logo";
import { formatRub, inMonth } from "@/lib/format";
import { cn } from "@/lib/utils";

const MODES: Mode[] = ["base", "adverse", "stress"];

/**
 * Режим презентации: история одного решения по шагам.
 * Все цифры считаются тем же ядром, что и в приложении, — ничего не вписано заранее.
 */
export default function PitchPage() {
  const model = useMemo(() => demoModel("cash"), []);
  const result = useMemo(() => runCrashTest(model), [model]);
  const bps = useMemo(() => findBreakpoints(model, { mode: "stress", criterion: "reserve" }), [model]);
  const alts = useMemo(() => compareAlternatives(model), [model]);
  const map = useMemo(() => stabilityMap(model, "stress", "start_month", "price", 9), [model]);
  const [i, setI] = useState(0);
  // Ссылка вида /pitch#3 открывает сразу третий слайд.
  useEffect(() => {
    const n = Number(window.location.hash.slice(1));
    if (n >= 1) setI(n - 1);
  }, []);

  const bp = (id: string) => bps.find((b) => b.id === id);
  const maxPrice = bp("max_price");
  const reserveFirst = alts.results.find((r) => r.alt.id === "reserve_first");
  const okAlts = alts.results.filter((r) => r.alt.available && r.summary.reserveOkAllModes);
  const base = result.modes.base.metrics;

  const slides: { title: string; body: React.ReactNode }[] = [
    {
      title: "А если всё пойдёт не по плану?",
      body: (
        <div className="space-y-6">
          <p className="max-w-3xl text-xl text-muted sm:text-2xl">
            Приложения для бюджета показывают, куда ушли деньги. Калькуляторы считают платёж. Но никто не отвечает на главный вопрос перед покупкой: <b className="text-fg">что будет, если обстоятельства изменятся?</b>
          </p>
          <p className="max-w-3xl text-lg text-muted">FUTUREWISE проверяет решение заранее — и находит момент, когда оно перестаёт быть безопасным.</p>
        </div>
      ),
    },
    {
      title: "Пример: ноутбук за 90 000 ₽",
      body: (
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            ["Зарплата", "60 000 ₽ в месяц"],
            ["Расходы", "35 000 ₽ в месяц"],
            ["Накоплено", "50 000 ₽"],
            ["Не трогать", "20 000 ₽ запаса"],
            ["Решение", "купить сразу всей суммой"],
            ["Что может случиться", "доход −20% на 2 месяца, трата 15 000 ₽"],
          ].map(([k, v]) => (
            <div key={k} className="card p-5">
              <div className="text-sm text-muted">{k}</div>
              <div className="mt-1 font-display text-xl font-bold">{v}</div>
            </div>
          ))}
          <p className="text-sm text-muted sm:col-span-3">Цифры придуманы для примера.</p>
        </div>
      ),
    },
    {
      title: "Краш-тест: три сценария",
      body: (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {MODES.map((k) => (
              <Badge key={k} tone={statusTone(result.modes[k].metrics.status)} className="text-sm">
                {MODE_META[k].label}: {STATUS_META[result.modes[k].metrics.status].label.toLowerCase()}
              </Badge>
            ))}
          </div>
          <BalanceChart
            height={300}
            reserve={model.finances.minReserve}
            series={MODES.map((k) => ({ key: k, label: MODE_META[k].label, color: SERIES_COLORS[k], rows: result.modes[k].rows, startBalance: model.finances.savings, dashed: k !== "base" }))}
          />
          <p className="text-lg">
            Даже если всё пойдёт по плану, {base.firstDeficitMonth ? `${inMonth(base.firstDeficitMonth)} баланс уйдёт в минус — до ${formatRub(base.minBalance)}` : "запас будет тронут"}.
          </p>
        </div>
      ),
    },
    {
      title: "Где предел",
      body: (
        <div className="grid gap-4 sm:grid-cols-2">
          {maxPrice?.status === "found" && (
            <div className="card p-6">
              <div className="text-sm text-muted">Самая дорогая покупка, которую вы потянете сразу</div>
              <div className="mt-2 font-display text-4xl font-extrabold text-accent">{formatRub(maxPrice.threshold!)}</div>
              <div className="mt-1 text-sm text-muted">вместо {formatRub(maxPrice.current!)}</div>
            </div>
          )}
          {reserveFirst?.alt.available && (
            <div className="card p-6">
              <div className="text-sm text-muted">Самый ранний безопасный месяц покупки — даже в кризис</div>
              <div className="mt-2 font-display text-4xl font-extrabold text-accent">{reserveFirst.alt.model.decision.startMonth}-й</div>
              <div className="mt-1 text-sm text-muted">в кризисном сценарии останется {formatRub(reserveFirst.summary.minBalance.stress)}</div>
            </div>
          )}
        </div>
      ),
    },
    {
      title: "Карта безопасной зоны",
      body: (
        <div className="space-y-3">
          <p className="text-muted">Цена × месяц покупки, кризисный сценарий</p>
          <div className="mx-auto grid max-w-xl gap-1" style={{ gridTemplateColumns: `repeat(${map.xs.length}, minmax(0, 1fr))` }}>
            {[...map.cells].reverse().flatMap((row, ri) =>
              row.map((c, ci) => (
                <div
                  key={`${ri}-${ci}`}
                  className="aspect-square rounded"
                  title={`${c.x}-й месяц, ${formatRub(c.y)}: ${STATUS_META[c.status].label}`}
                  style={{ background: c.status === "ok" ? "rgb(var(--good) / 0.6)" : c.status === "reserve" ? "rgb(var(--warn) / 0.6)" : "rgb(var(--bad) / 0.7)" }}
                />
              )),
            )}
          </div>
          <p className="text-center text-sm text-muted">Безопасно в {Math.round(map.safeShare * 100)}% комбинаций</p>
        </div>
      ),
    },
    {
      title: "Что надёжнее",
      body: (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {alts.results
              .filter((r) => r.alt.available)
              .slice(0, 6)
              .map((r) => (
                <div key={r.alt.id} className={cn("card p-4", r.summary.reserveOkAllModes && "ring-1 ring-good")}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{r.alt.title}</span>
                    <Badge tone={r.summary.reserveOkAllModes ? "good" : "warn"}>{r.summary.reserveOkAllModes ? "запас цел" : "есть риск"}</Badge>
                  </div>
                  <div className="mt-1 text-sm text-muted">в кризис в самый трудный момент: {formatRub(r.summary.minBalance.stress)}</div>
                </div>
              ))}
          </div>
          {okAlts.length > 0 && <p className="text-lg">Надёжных вариантов: {okAlts.length}</p>}
        </div>
      ),
    },
    {
      title: "FUTUREWISE",
      body: (
        <div className="space-y-6">
          <ul className="grid gap-3 text-lg sm:grid-cols-2">
            {[
              "Краш-тест решения в трёх сценариях",
              "Точный поиск предела: доход, платёж, цена",
              "Карта безопасной зоны и что влияет сильнее всего",
              "Долговая нагрузка — так же, как её считает банк (ПДН)",
              "Кредит с ПСК, досрочкой и графиком",
              "Цели, календарь до зарплаты, импорт выписки",
            ].map((t) => (
              <li key={t} className="card p-4">
                {t}
              </li>
            ))}
          </ul>
          <p className="text-muted">Без регистрации. Не прогноз и не совет.</p>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/new">
                Проверить своё решение <ArrowRight />
              </Link>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <Link href="/demo">
                <Play /> Открыть демо
              </Link>
            </Button>
          </div>
        </div>
      ),
    },
  ];

  const go = useCallback((d: number) => setI((x) => Math.min(slides.length - 1, Math.max(0, x + d))), [slides.length]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") {
        e.preventDefault();
        go(1);
      }
      if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        go(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  const s = slides[i];
  return (
    <div className="container flex min-h-[calc(100vh-4rem)] max-w-5xl flex-col py-8">
      <div className="flex items-center justify-between gap-3">
        <Logo />
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted">
            {i + 1} / {slides.length}
          </span>
          <Button variant="ghost" size="icon" aria-label="Во весь экран" onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})}>
            <Maximize2 />
          </Button>
        </div>
      </div>
      <div className="mt-3 flex gap-1" aria-hidden>
        {slides.map((_, k) => (
          <span key={k} className={cn("h-1 flex-1 rounded-full transition", k <= i ? "bg-accent" : "bg-surface-2")} />
        ))}
      </div>
      <section key={i} className="flex flex-1 animate-fade-up flex-col justify-center py-10" aria-live="polite">
        <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-6xl">{s.title}</h1>
        <div className="mt-8">{s.body}</div>
      </section>
      <div className="flex items-center justify-between gap-3">
        <Button variant="secondary" onClick={() => go(-1)} disabled={i === 0}>
          <ArrowLeft /> Назад
        </Button>
        <span className="hidden text-xs text-muted sm:inline">Стрелки ← → или пробел</span>
        <Button onClick={() => go(1)} disabled={i === slides.length - 1}>
          Дальше <ArrowRight />
        </Button>
      </div>
    </div>
  );
}
