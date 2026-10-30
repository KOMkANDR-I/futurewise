"use client";

import { useMemo, useState } from "react";
import { Grid3x3, SlidersHorizontal } from "lucide-react";
import { axisOptions, MODE_META, stabilityMap, STATUS_META, tornado, type AxisId, type AxisOption, type Mode, type StabilityCell } from "@/lib/engine";
import { useWorkspace } from "@/components/workspace/context";
import { Badge, Card, Segmented, inputClass } from "@/components/ui/primitives";
import { formatCompactRub, formatPct, formatRub, fromMonth } from "@/lib/format";
import { cn } from "@/lib/utils";

const MODES: Mode[] = ["base", "adverse", "stress"];

function fmtAxis(a: AxisOption, v: number, compact = false) {
  if (a.unit === "pct") return formatPct(Math.round(v * 10) / 10);
  if (a.unit === "month") return `${Math.round(v)}-й мес.`;
  return compact ? formatCompactRub(v) : formatRub(v);
}

const cellColor = (c: StabilityCell, reserve: number) => {
  if (c.status === "deficit") return "rgb(var(--bad) / 0.75)";
  if (c.status === "reserve") return "rgb(var(--warn) / 0.6)";
  // Чем больше запас над резервом, тем насыщеннее зелёный (логарифмическая шкала).
  const margin = Math.max(0, c.minBalance - reserve);
  const t = Math.min(1, Math.log10(1 + margin / 5000) / 1.6);
  return `rgb(var(--good) / ${0.25 + 0.55 * t})`;
};

function Tornado() {
  const { model } = useWorkspace();
  const [mode, setMode] = useState<Mode>("stress");
  const [pct, setPct] = useState<"10" | "20" | "30">("20");
  const all = useMemo(() => tornado(model, mode, Number(pct)), [model, mode, pct]);
  const items = all.filter((i) => i.spread >= 1);
  const flat = all.filter((i) => i.spread < 1);
  const reserve = model.finances.minReserve;
  const vals = items.flatMap((i) => [i.low.minBalance, i.high.minBalance]);
  const lo = Math.min(0, reserve, ...vals);
  const hi = Math.max(reserve, ...vals, 1);
  const x = (v: number) => ((v - lo) / (hi - lo || 1)) * 100;

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-display text-lg font-bold">
            <SlidersHorizontal className="size-4 text-accent" /> Что влияет сильнее всего
          </h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Segmented size="sm" label="Сценарий" value={mode} onChange={setMode} options={MODES.map((k) => ({ value: k, label: MODE_META[k].label }))} />
          <Segmented
            size="sm"
            label="Насколько менять"
            value={pct}
            onChange={setPct}
            options={[
              { value: "10", label: "±10%" },
              { value: "20", label: "±20%" },
              { value: "30", label: "±30%" },
            ]}
          />
        </div>
      </div>
      {items.length === 0 ? (
        <p className="mt-6 text-sm text-muted">Здесь пока нечего сравнивать.</p>
      ) : (
        <div className="mt-5 space-y-3">
          <div className="relative ml-[38%] h-4 text-[10px] text-muted sm:ml-[30%]" aria-hidden>
            <span className="absolute -translate-x-1/2 text-bad" style={{ left: `${x(0)}%` }}>
              0
            </span>
            <span className="absolute -translate-x-1/2 text-violet" style={{ left: `${x(reserve)}%` }}>
              запас
            </span>
          </div>
          {items.map((it) => {
            const a = Math.min(it.low.minBalance, it.high.minBalance);
            const b = Math.max(it.low.minBalance, it.high.minBalance);
            const worse = it.low.minBalance < it.high.minBalance ? "−" : "+";
            return (
              <div key={it.id} className="grid grid-cols-[38%_1fr] items-center gap-3 sm:grid-cols-[30%_1fr]">
                <div className="min-w-0 text-right text-xs">
                  <div className="truncate font-medium" title={it.label}>
                    {it.label}
                  </div>
                  <div className="num text-muted">{it.unit === "pct" ? formatPct(it.base) : formatRub(it.base)}</div>
                </div>
                <div>
                  <div
                    className="relative h-5 rounded-md bg-surface-2/50"
                    role="img"
                    aria-label={`${it.label}: в самый трудный момент от ${formatRub(a)} до ${formatRub(b)}`}
                    title={`−${pct}%: ${formatRub(it.low.minBalance)} · +${pct}%: ${formatRub(it.high.minBalance)}`}
                  >
                    <div className="absolute inset-y-0 w-px bg-bad/60" style={{ left: `${x(0)}%` }} />
                    <div className="absolute inset-y-0 w-px border-l border-dashed border-violet" style={{ left: `${x(reserve)}%` }} />
                    <div
                      className={cn("absolute inset-y-0.5 rounded", b < 0 ? "bg-bad/60" : a < reserve ? "bg-warn/60" : "bg-accent/60")}
                      style={{ left: `${x(a)}%`, width: `${Math.max(0.8, x(b) - x(a))}%` }}
                    />
                  </div>
                  <div className="num mt-0.5 text-[10px] text-muted">
                    от {formatRub(a)} до {formatRub(b)} · хуже, если {worse === "−" ? "меньше" : "больше"} на {pct}%
                  </div>
                </div>
              </div>
            );
          })}
          {flat.length > 0 && (
            <p className="pt-2 text-xs text-muted">
              Не влияют: {flat.map((f) => f.label).join("; ")}.
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

function Map2D() {
  const { model } = useWorkspace();
  const opts = useMemo(() => axisOptions(model), [model]);
  const [mode, setMode] = useState<Mode>("stress");
  const [xId, setXId] = useState<AxisId>("income_drop");
  const [yId, setYId] = useState<AxisId>(opts.some((o) => o.id === "price") ? "price" : "extra_expense");
  const [sel, setSel] = useState<{ i: number; j: number } | null>(null);
  const map = useMemo(() => stabilityMap(model, mode, xId, yId === xId ? (opts.find((o) => o.id !== xId)!.id as AxisId) : yId, 11), [model, mode, xId, yId, opts]);
  const reserve = model.finances.minReserve;
  const nearest = (arr: number[], v: number) => arr.reduce((bi, x, i) => (Math.abs(x - v) < Math.abs(arr[bi] - v) ? i : bi), 0);
  const cx = nearest(map.xs, map.x.current);
  const cy = nearest(map.ys, map.y.current);
  const picked = sel ? map.cells[sel.i]?.[sel.j] : null;
  const rows = [...map.cells.map((r, i) => ({ r, i }))].reverse();

  const select = (id: AxisId, setter: (v: AxisId) => void, label: string) => (
    <label className="space-y-1 text-xs text-muted">
      {label}
      <select className={cn(inputClass, "h-9 py-0")} value={id} onChange={(e) => setter(e.target.value as AxisId)}>
        {opts.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-display text-lg font-bold">
            <Grid3x3 className="size-4 text-violet" /> Карта безопасной зоны
          </h2>
        </div>
        <Badge tone={map.safeShare > 0.66 ? "good" : map.safeShare > 0.33 ? "warn" : "bad"}>запас цел в {Math.round(map.safeShare * 100)}% клеток</Badge>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        {select(xId, setXId, "Слева направо")}
        {select(yId, setYId, "Снизу вверх")}
        <div className="space-y-1 text-xs text-muted">
          Сценарий
          <Segmented size="sm" label="Сценарий для карты" value={mode} onChange={setMode} options={MODES.map((k) => ({ value: k, label: MODE_META[k].short }))} className="flex flex-nowrap whitespace-nowrap" />
        </div>
      </div>

      <div className="mt-5 overflow-x-auto">
        <div className="min-w-[520px]">
          <div className="flex">
            <div className="flex w-20 shrink-0 items-center justify-center">
              <span className="-rotate-90 whitespace-nowrap text-[11px] text-muted">{map.y.label}</span>
            </div>
            <div className="flex-1">
              <div className="grid gap-[3px]" style={{ gridTemplateColumns: `56px repeat(${map.xs.length}, minmax(0, 1fr))` }} role="grid" aria-label="Карта безопасной зоны">
                {rows.map(({ r, i }) => (
                  <div key={i} role="row" className="contents">
                    <div className="num flex items-center justify-end pr-1 text-[10px] text-muted">{fmtAxis(map.y, map.ys[i], true)}</div>
                    {r.map((c, j) => {
                      const current = i === cy && j === cx;
                      const active = sel?.i === i && sel?.j === j;
                      return (
                        <button
                          key={j}
                          type="button"
                          role="gridcell"
                          onClick={() => setSel({ i, j })}
                          aria-label={`${map.x.label} ${fmtAxis(map.x, c.x)}, ${map.y.label} ${fmtAxis(map.y, c.y)}: ${STATUS_META[c.status].label}, в самый трудный момент ${formatRub(c.minBalance)}`}
                          className={cn("aspect-square rounded-[4px] transition hover:scale-110 focus-visible:z-10", current && "ring-2 ring-fg ring-offset-1 ring-offset-surface", active && "outline outline-2 outline-accent")}
                          style={{ background: cellColor(c, reserve) }}
                        />
                      );
                    })}
                  </div>
                ))}
                <div />
                {map.xs.map((v, j) => (
                  <div key={j} className="num pt-1 text-center text-[10px] text-muted">
                    {j % 2 === 0 ? fmtAxis(map.x, v, true) : ""}
                  </div>
                ))}
              </div>
              <div className="mt-1 text-center text-[11px] text-muted">{map.x.label}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm" style={{ background: "rgb(var(--good) / 0.7)" }} /> запас цел (чем ярче, тем больше денег в запасе)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm" style={{ background: "rgb(var(--warn) / 0.6)" }} /> запас тронут
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm" style={{ background: "rgb(var(--bad) / 0.75)" }} /> денег не хватает
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm ring-2 ring-fg" /> ваш сценарий сейчас
        </span>
      </div>

      <div className="mt-4 rounded-xl bg-surface-2/50 p-4 text-sm" aria-live="polite">
        {picked ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={picked.status === "ok" ? "good" : picked.status === "reserve" ? "warn" : "bad"}>{STATUS_META[picked.status].label}</Badge>
              <span>
                {map.x.label}: <b className="num">{fmtAxis(map.x, picked.x)}</b> · {map.y.label}: <b className="num">{fmtAxis(map.y, picked.y)}</b>
              </span>
            </div>
            <p className="mt-2 text-muted">
              В самый трудный момент у вас будет <span className="num font-semibold text-fg">{formatRub(picked.minBalance)}</span>
              {picked.firstBreach ? `, запас тронут ${fromMonth(picked.firstBreach)}` : ", запас цел"}.
            </p>
          </>
        ) : (
          <p className="text-muted">Сейчас: {fmtAxis(map.x, map.x.current)} и {fmtAxis(map.y, map.y.current)}</p>
        )}
      </div>
    </Card>
  );
}

export default function SensitivityPage() {
  return (
    <div className="space-y-6">
      <Tornado />
      <Map2D />
    </div>
  );
}
