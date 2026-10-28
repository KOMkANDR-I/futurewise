"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface TourStep {
  target: string;
  title: string;
  text: string;
}

export const WORKSPACE_TOUR: TourStep[] = [
  { target: "kpis", title: "Главное — сразу", text: "Сейчас, через срок и самый трудный момент." },
  { target: "chart", title: "Три сценария", text: "Обычный, трудный и кризисный." },
  { target: "params", title: "Ползунки", text: "Всё пересчитывается сразу." },
  { target: "pdn", title: "Долговая нагрузка", text: "Доля дохода на кредиты. Ориентиры ЦБ — 50% и 80%." },
  { target: "tabs", title: "Вкладки", text: "Предел, цели, календарь, варианты." },
];

const KEY = "futurewise.tour.v1";

export function tourSeen(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return true;
  }
}

function markSeen() {
  try {
    localStorage.setItem(KEY, "1");
  } catch {}
}

/** Короткая экскурсия с подсветкой элементов. Элементы ищутся по data-tour. */
export function Tour({ steps, open, onClose }: { steps: TourStep[]; open: boolean; onClose: () => void }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const available = steps.filter((s) => typeof document !== "undefined" && document.querySelector(`[data-tour="${s.target}"]`));
  const step = available[Math.min(i, available.length - 1)];

  const measure = useCallback(() => {
    if (!step) return;
    const el = document.querySelector(`[data-tour="${step.target}"]`) as HTMLElement | null;
    setRect(el ? el.getBoundingClientRect() : null);
  }, [step]);

  useEffect(() => {
    if (open) setI(0);
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !step) return;
    const el = document.querySelector(`[data-tour="${step.target}"]`) as HTMLElement | null;
    if (el) {
      // Элемент — ближе к верху экрана, чтобы карточка подсказки поместилась под ним.
      const r = el.getBoundingClientRect();
      const fitsBelow = r.height + 220 < window.innerHeight - 96;
      const top = window.scrollY + r.top - (fitsBelow ? 88 : Math.max(16, (window.innerHeight - r.height) / 2));
      window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    }
    const t = setTimeout(measure, 350);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, step, measure]);

  const close = useCallback(() => {
    markSeen();
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") setI((x) => Math.min(available.length - 1, x + 1));
      if (e.key === "ArrowLeft") setI((x) => Math.max(0, x - 1));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close, available.length]);

  if (!open || !step) return null;
  const pad = 8;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
  const vh = typeof window !== "undefined" ? window.innerHeight : 768;
  const CARD_H = 200;
  let cardTop = vh / 2 - CARD_H / 2;
  if (rect) {
    if (rect.bottom + 16 + CARD_H < vh) cardTop = rect.bottom + 16;
    else if (rect.top - 16 - CARD_H > 16) cardTop = rect.top - 16 - CARD_H;
    else cardTop = vh - CARD_H - 16; // элемент высокий — карточка внизу экрана
  }
  const cardLeft = rect ? Math.min(Math.max(16, rect.left), vw - 16 - Math.min(360, vw - 32)) : 16;
  const last = i >= available.length - 1;

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label={`Подсказка ${i + 1} из ${available.length}: ${step.title}`}>
      <div className="absolute inset-0" onClick={close} />
      {rect && (
        <div
          className="pointer-events-none absolute rounded-2xl outline outline-2 outline-[rgb(var(--accent))] transition-all duration-300"
          style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2, boxShadow: "0 0 0 9999px rgb(0 0 0 / 0.55)" }}
        />
      )}
      <div className="card absolute w-[calc(100vw-32px)] max-w-[360px] animate-fade-up p-5" style={{ top: cardTop, left: cardLeft }}>
        <div className="flex items-start justify-between gap-3">
          <p className="eyebrow">
            Подсказка {i + 1} из {available.length}
          </p>
          <button type="button" onClick={close} className="rounded-lg p-1 text-muted hover:bg-surface-2 hover:text-fg" aria-label="Закрыть подсказки">
            <X className="size-4" />
          </button>
        </div>
        <h3 className="mt-2 font-display text-lg font-bold">{step.title}</h3>
        <p className="mt-1.5 text-sm text-muted">{step.text}</p>
        <div className="mt-4 flex items-center justify-between">
          <button type="button" onClick={close} className="text-xs text-muted hover:text-fg">
            Больше не показывать
          </button>
          <div className="flex gap-2">
            {i > 0 && (
              <Button size="sm" variant="secondary" onClick={() => setI(i - 1)}>
                <ArrowLeft /> Назад
              </Button>
            )}
            <Button size="sm" onClick={() => (last ? close() : setI(i + 1))} autoFocus>
              {last ? "Понятно" : "Дальше"} {!last && <ArrowRight />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
