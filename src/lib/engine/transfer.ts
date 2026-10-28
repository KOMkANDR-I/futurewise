import { z } from "zod";
import { modelSchema } from "./schema";
import type { ModelInput } from "./types";

/** Формат файла экспорта: переносимый JSON без привязки к браузеру. */
export const EXPORT_FORMAT = "futurewise.scenarios";
export const EXPORT_VERSION = 1;

const itemSchema = z.object({ title: z.string().trim().min(1).max(80), model: modelSchema });
const fileSchema = z.object({
  format: z.literal(EXPORT_FORMAT),
  version: z.number().int().min(1).max(EXPORT_VERSION),
  items: z.array(itemSchema).min(1, "В файле нет сценариев").max(100, "Не более 100 сценариев в одном файле"),
});

export function serializeScenarios(items: { title: string; model: ModelInput }[]): string {
  return JSON.stringify({ format: EXPORT_FORMAT, version: EXPORT_VERSION, exportedAt: new Date().toISOString(), items }, null, 2);
}

export type ParseResult = { ok: true; items: { title: string; model: ModelInput }[] } | { ok: false; error: string };

export function parseScenarios(text: string): ParseResult {
  if (text.length > 2_000_000) return { ok: false, error: "Файл слишком большой" };
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: "Файл не является корректным JSON" };
  }
  const r = fileSchema.safeParse(data);
  if (!r.success) {
    const issue = r.error.issues[0];
    if (issue?.path[0] === "format") return { ok: false, error: "Это не файл сценариев FUTUREWISE" };
    return { ok: false, error: `Файл не прошёл проверку: ${issue?.message ?? "неизвестная ошибка"}` };
  }
  return { ok: true, items: r.data.items as { title: string; model: ModelInput }[] };
}
