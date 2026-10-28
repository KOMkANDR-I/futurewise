"use client";

import { Plus, Trash2 } from "lucide-react";
import { EVENT_META, makeEvent, type StressEvent, type StressEventType } from "@/lib/engine";
import { Button } from "@/components/ui/button";
import { Badge, Field, NumberInput, Segmented, Switch } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

const TYPES = Object.keys(EVENT_META) as StressEventType[];

export function EventCard({
  event,
  horizon,
  onChange,
  onRemove,
  compact,
}: {
  event: StressEvent;
  horizon: number;
  onChange: (e: StressEvent) => void;
  onRemove?: () => void;
  compact?: boolean;
}) {
  const meta = EVENT_META[event.type];
  const id = `ev-${event.id}`;
  const set = (patch: Partial<StressEvent>) => onChange({ ...event, ...patch });
  const isPct = meta.unit === "%";
  return (
    <div className={cn("rounded-2xl border bg-surface-2/40 p-4 transition", !event.enabled && "opacity-60")}>
      <div className="flex flex-wrap items-center gap-3">
        <Switch checked={event.enabled} onCheckedChange={(v) => set({ enabled: v })} aria-label={`Учитывать событие «${meta.label}»`} />
        <span className="font-semibold">{meta.label}</span>
        <Segmented
          size="sm"
          label="В каком сценарии учитывать"
          value={event.tier}
          onChange={(tier) => set({ tier })}
          options={[
            { value: "adverse", label: "Трудный и кризисный" },
            { value: "stress", label: "Только кризисный" },
          ]}
        />
        {onRemove && (
          <Button variant="ghost" size="icon" className="ml-auto" onClick={onRemove} aria-label={`Удалить событие «${meta.label}»`}>
            <Trash2 />
          </Button>
        )}
      </div>
      <div className={cn("mt-4 grid gap-3", compact ? "grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-4")}>
        <Field label={meta.valueLabel} htmlFor={`${id}-v`}>
          <NumberInput id={`${id}-v`} value={event.value} onChange={(v) => set({ value: v ?? 0 })} suffix={meta.unit} min={0} max={isPct ? 100 : event.type === "income_delay" ? horizon : undefined} />
        </Field>
        <Field label="В каком месяце" htmlFor={`${id}-m`}>
          <NumberInput id={`${id}-m`} value={event.month} onChange={(v) => set({ month: Math.max(1, v ?? 1) })} min={1} max={horizon} suffix="мес" />
        </Field>
        {meta.durationLabel && (
          <Field label={meta.durationLabel} htmlFor={`${id}-d`}>
            <NumberInput id={`${id}-d`} value={event.duration} onChange={(v) => set({ duration: Math.max(1, v ?? 1) })} min={1} max={horizon} suffix="мес" />
          </Field>
        )}
        <Field label="Насколько вероятно" htmlFor={`${id}-p`} hint="Можно пусто">
          <NumberInput id={`${id}-p`} value={event.probability} allowEmpty onChange={(v) => set({ probability: v })} suffix="%" min={0} max={100} placeholder="не знаю" />
        </Field>
      </div>
    </div>
  );
}

export function EventsEditor({ events, onChange, horizon }: { events: StressEvent[]; onChange: (e: StressEvent[]) => void; horizon: number }) {
  return (
    <div className="space-y-4">
      {events.length === 0 && (
        <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted">
          Событий нет
        </p>
      )}
      {events.map((e, i) => (
        <EventCard
          key={e.id}
          event={e}
          horizon={horizon}
          onChange={(ne) => onChange(events.map((x, j) => (j === i ? ne : x)))}
          onRemove={() => onChange(events.filter((_, j) => j !== i))}
        />
      ))}
      <div>
        <p className="mb-2 text-sm font-medium">Что может случиться</p>
        <div className="flex flex-wrap gap-2">
          {TYPES.map((t) => (
            <Button key={t} type="button" variant="secondary" size="sm" disabled={events.length >= 20} onClick={() => onChange([...events, makeEvent(t, { tier: events.length ? "stress" : "adverse" })])}>
              <Plus /> {EVENT_META[t].label}
            </Button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted">
          <Badge tone="violet">Трудный и кризисный</Badge> — событие учитывается в обоих сценариях.
          <Badge tone="warn">Только кризисный</Badge> — только в самом плохом.
        </div>
      </div>
    </div>
  );
}
