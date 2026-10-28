/**
 * Разбор банковской выписки в CSV прямо в браузере. Файл никуда не отправляется.
 * Поддерживаются разделители «;», «,» и табуляция, кодировки UTF-8 и Windows-1251,
 * суммы вида «-1 234,56» и даты «31.12.2026», «2026-12-31», «31/12/2026».
 */

export type FlowKind = "income" | "fixed" | "variable" | "debt" | "skip";

export const FLOW_KIND_LABELS: Record<FlowKind, string> = {
  income: "Доход",
  fixed: "Обязательные",
  variable: "На жизнь",
  debt: "Кредиты",
  skip: "Не учитывать",
};

export interface StatementRow {
  date: Date;
  amount: number;
  category: string;
  description: string;
}

export interface ColumnMap {
  date: number | null;
  amount: number | null;
  /** Если у банка расход и приход в разных колонках. */
  debit: number | null;
  credit: number | null;
  category: number | null;
  description: number | null;
}

export function decodeBytes(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("windows-1251").decode(bytes);
  }
}

export function detectDelimiter(firstLine: string): string {
  const counts = [";", ",", "\t"].map((d) => ({ d, n: firstLine.split(d).length - 1 }));
  return counts.sort((a, b) => b.n - a.n)[0].n > 0 ? counts[0].d : ";";
}

/** CSV с кавычками: "a;b" — одно поле, "" внутри кавычек — сама кавычка. */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const firstLine = clean.split("\n").find((l) => l.trim()) ?? "";
  const delim = detectDelimiter(firstLine);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (quoted) {
      if (c === '"' && clean[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) {
      row.push(field.trim());
      field = "";
    } else if (c === "\n") {
      row.push(field.trim());
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  row.push(field.trim());
  if (row.some((x) => x !== "")) rows.push(row);
  return rows;
}

/** Ищет строку заголовков: первую, где есть и дата, и сумма. */
export function findHeader(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const m = detectColumns(rows[i]);
    if (m.date != null && (m.amount != null || m.debit != null || m.credit != null)) return i;
  }
  return 0;
}

export function detectColumns(header: string[]): ColumnMap {
  const h = header.map((x) => x.toLowerCase());
  const find = (re: RegExp, exclude?: RegExp) => {
    const i = h.findIndex((x) => re.test(x) && !(exclude && exclude.test(x)));
    return i >= 0 ? i : null;
  };
  return {
    date: find(/дата|date/, /обработ|списан|processing/) ?? find(/дата|date/),
    amount: find(/сумма операции|сумма|amount/, /кэшб|cashback|бонус|комисси|округлен/),
    debit: find(/^расход|списани|debit|^дебет/),
    credit: find(/^приход|зачислени|поступлени|credit|^кредит$/),
    category: find(/категор|category/),
    description: find(/описани|назначени|description|контрагент|получател|merchant|наименован/),
  };
}

export function parseAmount(raw: string): number | null {
  if (!raw) return null;
  let s = raw.replace(/[\s ]/g, "").replace(/[−–]/g, "-").replace(/[^\d,.\-()]/g, "");
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(",", ".");
  const n = Number(s);
  if (!Number.isFinite(n) || s === "" || s === "-") return null;
  return neg ? -Math.abs(n) : n;
}

export function parseDate(raw: string): Date | null {
  const s = raw.trim();
  let m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const d = new Date(y, Number(m[2]) - 1, Number(m[1]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export function extractRows(rows: string[][], headerIndex: number, map: ColumnMap): StatementRow[] {
  const out: StatementRow[] = [];
  for (const r of rows.slice(headerIndex + 1)) {
    const date = map.date != null ? parseDate(r[map.date] ?? "") : null;
    if (!date) continue;
    let amount: number | null = null;
    if (map.amount != null) amount = parseAmount(r[map.amount] ?? "");
    if (amount == null && (map.debit != null || map.credit != null)) {
      const d = map.debit != null ? parseAmount(r[map.debit] ?? "") : null;
      const c = map.credit != null ? parseAmount(r[map.credit] ?? "") : null;
      if (d) amount = -Math.abs(d);
      else if (c) amount = Math.abs(c);
    }
    if (amount == null || amount === 0) continue;
    out.push({
      date,
      amount,
      category: map.category != null ? (r[map.category] ?? "").trim() : "",
      description: map.description != null ? (r[map.description] ?? "").trim() : "",
    });
  }
  return out;
}

const RE_TRANSFER_OWN = /между (своими )?счет|между своими|на свой сч|пополнение вклад|перевод на вклад|накопительн|сбережен|копилк/i;
const RE_DEBT = /кредит|рассрочк|займ|ипотек|погашени|сплит|долями|split/i;
const RE_FIXED = /жкх|коммунал|квартплат|аренд|связь|мобильн|интернет|телефон|транспорт|проезд|метро|страхов|подписк|образован|обучен|детск|сад|налог/i;

export function guessKind(row: StatementRow): FlowKind {
  const text = `${row.category} ${row.description}`;
  if (RE_TRANSFER_OWN.test(text)) return "skip";
  if (row.amount > 0) return "income";
  if (RE_DEBT.test(text)) return "debt";
  if (RE_FIXED.test(text)) return "fixed";
  return "variable";
}

export const categoryKey = (r: StatementRow) => (r.category || r.description.split(/\s+/).slice(0, 3).join(" ") || "Без категории").slice(0, 50);

export interface StatementSummary {
  months: number;
  from: Date | null;
  to: Date | null;
  operations: number;
  totals: Record<FlowKind, number>;
  /** Средние в месяц по видам. */
  monthly: Record<FlowKind, number>;
  categories: { key: string; kind: FlowKind; total: number; count: number; sign: 1 | -1 }[];
}

/** Сводка выписки. kinds — выбор пользователя по категориям (переопределяет автоматическое определение). */
export function summarizeStatement(rows: StatementRow[], kinds: Record<string, FlowKind> = {}): StatementSummary {
  const monthsSet = new Set(rows.map((r) => `${r.date.getFullYear()}-${r.date.getMonth()}`));
  const months = Math.max(1, monthsSet.size);
  const totals: Record<FlowKind, number> = { income: 0, fixed: 0, variable: 0, debt: 0, skip: 0 };
  const cats = new Map<string, { key: string; kind: FlowKind; total: number; count: number; sign: 1 | -1 }>();
  for (const r of rows) {
    const key = `${r.amount > 0 ? "+" : "−"} ${categoryKey(r)}`;
    const auto = guessKind(r);
    const kind = kinds[key] ?? auto;
    // Поступления не бывают расходами и наоборот: при несовпадении знака операцию не учитываем.
    const effective: FlowKind = kind === "skip" ? "skip" : r.amount > 0 ? (kind === "income" ? "income" : "skip") : kind === "income" ? "skip" : kind;
    totals[effective] += Math.abs(r.amount);
    const c = cats.get(key) ?? { key, kind, total: 0, count: 0, sign: r.amount > 0 ? 1 : -1 };
    c.total += Math.abs(r.amount);
    c.count++;
    cats.set(key, c);
  }
  const sorted = [...rows].sort((a, b) => a.date.getTime() - b.date.getTime());
  const monthly = Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, Math.round(v / months)])) as Record<FlowKind, number>;
  return {
    months,
    from: sorted[0]?.date ?? null,
    to: sorted[sorted.length - 1]?.date ?? null,
    operations: rows.length,
    totals,
    monthly,
    categories: [...cats.values()].sort((a, b) => b.total - a.total),
  };
}
