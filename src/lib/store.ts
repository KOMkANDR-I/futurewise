"use client";

import { useSyncExternalStore } from "react";
import { modelSchema, type ModelInput } from "@/lib/engine";

/** Сценарии хранятся только в localStorage этого браузера. */
export interface SavedScenario {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  demo: boolean;
  model: ModelInput;
}

const KEY = "futurewise.scenarios.v1";
const listeners = new Set<() => void>();
let cache: SavedScenario[] | null = null;
const EMPTY: SavedScenario[] = [];

function read(): SavedScenario[] {
  if (cache) return cache;
  try {
    const raw = window.localStorage.getItem(KEY);
    const arr = raw ? (JSON.parse(raw) as SavedScenario[]) : [];
    // Повреждённые или устаревшие записи пропускаются, а не ломают приложение.
    cache = Array.isArray(arr) ? arr.filter((s) => s && typeof s.id === "string" && modelSchema.safeParse(s.model).success) : [];
  } catch {
    cache = [];
  }
  return cache;
}

let storageError: string | null = null;
export const getStorageError = () => storageError;

function write(next: SavedScenario[]) {
  cache = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
    storageError = null;
  } catch {
    storageError = "Не удалось сохранить в localStorage браузера — изменения действуют до перезагрузки страницы.";
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cache = null;
      cb();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function useScenarios(): SavedScenario[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

/** false на сервере и при первом рендере — чтобы отличать «загрузка» от «сценарий не найден». */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export function useScenario(id: string): SavedScenario | undefined {
  return useScenarios().find((s) => s.id === id);
}

const newId = () => `s_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export function createScenario(title: string, model: ModelInput, demo = false): SavedScenario {
  const now = Date.now();
  const s: SavedScenario = { id: newId(), title: title.trim() || "Без названия", createdAt: now, updatedAt: now, demo, model: structuredClone(model) };
  write([s, ...read()]);
  return s;
}

export function updateScenario(id: string, patch: Partial<Pick<SavedScenario, "title" | "model">>) {
  write(read().map((s) => (s.id === id ? { ...s, ...patch, model: patch.model ? structuredClone(patch.model) : s.model, updatedAt: Date.now() } : s)));
}

export function duplicateScenario(id: string): SavedScenario | undefined {
  const s = read().find((x) => x.id === id);
  if (!s) return;
  return createScenario(`${s.title} (копия)`, s.model, s.demo);
}

export function deleteScenario(id: string) {
  write(read().filter((s) => s.id !== id));
}
