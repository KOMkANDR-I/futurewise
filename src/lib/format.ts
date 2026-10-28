const rub = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const pct = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });

/** 90000 → «90 000 ₽». Отрицательные значения — со знаком минус. */
export function formatRub(x: number): string {
  if (!Number.isFinite(x)) return "—";
  const v = Math.round(x);
  return `${v < 0 ? "−" : ""}${rub.format(Math.abs(v)).replace(/ /g, " ")} ₽`;
}

export function formatNumber(x: number): string {
  return rub.format(Math.round(x)).replace(/ /g, " ");
}

export function formatPct(x: number): string {
  return `${pct.format(x)}%`;
}

export function formatCompactRub(x: number): string {
  const a = Math.abs(x);
  const sign = x < 0 ? "−" : "";
  // Неразрывный пробел: подписи осей не должны переноситься.
  if (a >= 1_000_000) return `${sign}${pct.format(a / 1_000_000)} млн`;
  if (a >= 1000) return `${sign}${Math.round(a / 1000)} тыс`;
  return `${sign}${Math.round(a)}`;
}

export function monthLabel(m: number): string {
  return `${m}-й месяц`;
}

/** Склонение: plural(5, ["месяц", "месяца", "месяцев"]) → «месяцев». */
export function plural(n: number, forms: [string, string, string]): string {
  const n10 = Math.abs(n) % 10;
  const n100 = Math.abs(n) % 100;
  if (n10 === 1 && n100 !== 11) return forms[0];
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return forms[1];
  return forms[2];
}

export function pluralMonths(n: number): string {
  return `${n} ${plural(n, ["месяц", "месяца", "месяцев"])}`;
}

/** «в 3-м месяце» */
export const inMonth = (m: number) => `в ${m}-м месяце`;
/** «со 2-го месяца», «с 3-го месяца» */
export const fromMonth = (m: number) => `${m === 2 ? "со" : "с"} ${m}-го месяца`;
/** Первая буква — заглавная. */
export const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
