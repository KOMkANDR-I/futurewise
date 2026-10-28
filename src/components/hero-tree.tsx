"use client";

import { useMemo, useState } from "react";
import { demoModel, makeEvent, simulateWith, STATUS_META, type Status } from "@/lib/engine";
import { formatRub, fromMonth } from "@/lib/format";

const color = (s: Status) => (s === "ok" ? "rgb(var(--good))" : s === "reserve" ? "rgb(var(--warn))" : "rgb(var(--bad))");

/**
 * Интерактивная ветвящаяся визуализация на главной. Все значения считаются ядром
 * на демонстрационных (условных) данных: ноутбук 90 000 ₽ в рассрочку 10 000 ₽ × 9 мес.
 */
export function HeroTree() {
  const [drop, setDrop] = useState(60);
  const [expense, setExpense] = useState(30000);
  const model = useMemo(() => demoModel("installment"), []);

  const branches = useMemo(() => {
    const d = makeEvent("income_drop", { value: drop, month: 2, duration: 3 });
    const x = makeEvent("unexpected_expense", { value: expense, month: 3 });
    return [
      { id: "a", title: "Всё по плану", sub: "без неприятностей", m: simulateWith(model, []).metrics },
      { id: "b", title: `Доход меньше на ${drop}%`, sub: "3 месяца подряд", m: simulateWith(model, [d]).metrics },
      { id: "c", title: `И ещё трата ${formatRub(expense)}`, sub: "вдобавок", m: simulateWith(model, [d, x]).metrics },
    ];
  }, [model, drop, expense]);

  const ys = [40, 150, 260];
  return (
    <div className="card relative overflow-hidden p-4 sm:p-6">
      <div className="mb-2 flex items-center justify-between text-xs text-muted">
        <span>Ноутбук 90 000 ₽ · рассрочка 10 000 ₽ × 9</span>
      </div>
      <svg viewBox="0 0 560 336" className="w-full" role="img" aria-label="Три варианта развития событий после покупки">
        <g>
          <rect x="8" y="128" width="150" height="64" rx="14" fill="rgb(var(--surface-2))" stroke="rgb(var(--accent))" strokeWidth="1.5" />
          <text x="24" y="154" fontSize="13" fontWeight="700" fill="rgb(var(--fg))">
            Решение
          </text>
          <text x="24" y="174" fontSize="11" fill="rgb(var(--muted))">
            в рассрочку
          </text>
        </g>
        {branches.map((b, i) => {
          const y = ys[i];
          const c = color(b.m.status);
          return (
            <g key={b.id}>
              <path d={`M158,160 C230,160 230,${y + 32} 300,${y + 32}`} fill="none" stroke={c} strokeWidth="2.5" strokeOpacity="0.8" strokeDasharray="600" className="animate-draw" />
              <circle cx="300" cy={y + 32} r="4" fill={c} />
              <rect x="308" y={y} width="244" height="64" rx="14" fill="rgb(var(--surface))" stroke="rgb(var(--border))" />
              <rect x="308" y={y + 14} width="4" height="36" rx="2" fill={c} />
              <text x="322" y={y + 24} fontSize="12.5" fontWeight="700" fill="rgb(var(--fg))">
                {b.title}
              </text>
              <text x="322" y={y + 42} fontSize="11" fill="rgb(var(--muted))">
                минимум {formatRub(b.m.minBalance)} · {b.sub}
              </text>
              <text x="322" y={y + 57} fontSize="10.5" fontWeight="600" fill={c}>
                {STATUS_META[b.m.status].label}
                {b.m.firstReserveBreachMonth ? ` ${fromMonth(b.m.firstReserveBreachMonth)}` : ""}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="mt-2 grid gap-4 sm:grid-cols-2">
        <label className="space-y-1.5 text-xs">
          <span className="flex justify-between text-muted">
            Доход упал на <span className="num font-semibold text-fg">{drop}%</span>
          </span>
          <input type="range" min={0} max={80} step={5} value={drop} onChange={(e) => setDrop(Number(e.target.value))} />
        </label>
        <label className="space-y-1.5 text-xs">
          <span className="flex justify-between text-muted">
            Внезапная трата <span className="num font-semibold text-fg">{formatRub(expense)}</span>
          </span>
          <input type="range" min={0} max={120000} step={5000} value={expense} onChange={(e) => setExpense(Number(e.target.value))} />
        </label>
      </div>
    </div>
  );
}
