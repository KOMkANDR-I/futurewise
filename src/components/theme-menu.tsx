"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ThemeChoice = "system" | "light" | "dark";

const KEY = "futurewise.theme";
const OPTIONS: { value: ThemeChoice; label: string; icon: LucideIcon }[] = [
  { value: "system", label: "Как в системе", icon: Monitor },
  { value: "light", label: "Светлая", icon: Sun },
  { value: "dark", label: "Тёмная", icon: Moon },
];

const prefersDark = () => window.matchMedia("(prefers-color-scheme: dark)").matches;

function readChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

function apply(choice: ThemeChoice) {
  const dark = choice === "dark" || (choice === "system" && prefersDark());
  document.documentElement.classList.toggle("dark", dark);
}

/**
 * Выбор темы: как в системе / светлая / тёмная.
 * «Как в системе» следит за настройкой ОС и меняет тему сразу, без перезагрузки.
 */
export function ThemeMenu() {
  const [choice, setChoice] = useState<ThemeChoice>("system");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    setChoice(readChoice());
  }, []);

  // В режиме «Как в системе» реагируем на смену темы ОС.
  useEffect(() => {
    if (choice !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    mq.addEventListener("change", onChange);
    // Подстраховка: перепроверяем, когда пользователь возвращается на вкладку.
    window.addEventListener("focus", onChange);
    document.addEventListener("visibilitychange", onChange);
    return () => {
      mq.removeEventListener("change", onChange);
      window.removeEventListener("focus", onChange);
      document.removeEventListener("visibilitychange", onChange);
    };
  }, [choice]);

  // Закрытие по клику снаружи и по Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (open) itemRefs.current[OPTIONS.findIndex((o) => o.value === choice)]?.focus();
  }, [open, choice]);

  const select = (value: ThemeChoice) => {
    setChoice(value);
    try {
      if (value === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, value);
    } catch {}
    apply(value);
    setOpen(false);
  };

  const Current = OPTIONS.find((o) => o.value === choice)!.icon;

  return (
    <div ref={rootRef} className="relative">
      <Button
        variant="ghost"
        size="icon"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Тема: ${OPTIONS.find((o) => o.value === choice)!.label.toLowerCase()}. Выбрать тему`}
        onClick={() => setOpen((v) => !v)}
      >
        <Current />
      </Button>
      {open && (
        <div role="menu" aria-label="Тема оформления" className="card absolute right-0 top-11 z-50 w-48 animate-fade-up p-1">
          {OPTIONS.map((o, i) => {
            const active = o.value === choice;
            return (
              <button
                key={o.value}
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => select(o.value)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                    e.preventDefault();
                    const n = (i + (e.key === "ArrowDown" ? 1 : -1) + OPTIONS.length) % OPTIONS.length;
                    itemRefs.current[n]?.focus();
                  }
                }}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition hover:bg-surface-2 focus-visible:bg-surface-2",
                  active ? "font-semibold text-fg" : "text-muted",
                )}
              >
                <o.icon className="size-4" />
                <span className="flex-1">{o.label}</span>
                {active && <Check className="size-4 text-accent" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
