"use client";

import { useMemo, useRef, useState } from "react";
import { FileSpreadsheet, ShieldCheck, Upload } from "lucide-react";
import {
  decodeBytes,
  detectColumns,
  extractRows,
  findHeader,
  FLOW_KIND_LABELS,
  parseCsv,
  summarizeStatement,
  type ColumnMap,
  type FlowKind,
  type StatementRow,
} from "@/lib/import/statement";
import { Button } from "@/components/ui/button";
import { Dialog, inputClass } from "@/components/ui/primitives";
import { formatRub, pluralMonths } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface StatementApply {
  income: number;
  fixedExpenses: number;
  variableExpenses: number;
  debtPayments: number;
}

const COLS: { key: keyof ColumnMap; label: string }[] = [
  { key: "date", label: "Дата" },
  { key: "amount", label: "Сумма" },
  { key: "category", label: "Категория" },
  { key: "description", label: "Описание" },
];

/** Заполнение доходов и расходов из банковской выписки (CSV). Всё считается в браузере. */
export function StatementImport({ onApply }: { onApply: (v: StatementApply) => void }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [table, setTable] = useState<{ rows: string[][]; header: number; map: ColumnMap; fileName: string } | null>(null);
  const [kinds, setKinds] = useState<Record<string, FlowKind>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const rows: StatementRow[] = useMemo(() => (table ? extractRows(table.rows, table.header, table.map) : []), [table]);
  const sum = useMemo(() => (rows.length ? summarizeStatement(rows, kinds) : null), [rows, kinds]);

  const onFile = async (file: File | undefined) => {
    setError(null);
    if (!file) return;
    if (file.size > 5_000_000) return setError("Файл больше 5 МБ — сохраните выписку за меньший период.");
    try {
      const text = decodeBytes(await file.arrayBuffer());
      const parsed = parseCsv(text);
      if (parsed.length < 2) return setError("В файле нет строк с операциями.");
      const header = findHeader(parsed);
      const map = detectColumns(parsed[header]);
      setKinds({});
      setTable({ rows: parsed, header, map, fileName: file.name });
      if (map.date == null || (map.amount == null && map.debit == null && map.credit == null)) setError("Не нашли колонки с датой и суммой — укажите их вручную ниже.");
    } catch {
      setError("Не получилось прочитать файл. Нужна выписка в формате CSV.");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const apply = () => {
    if (!sum) return;
    onApply({ income: sum.monthly.income, fixedExpenses: sum.monthly.fixed, variableExpenses: sum.monthly.variable, debtPayments: sum.monthly.debt });
    setOpen(false);
  };

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <FileSpreadsheet /> Заполнить из выписки банка
      </Button>
      <Dialog open={open} onOpenChange={setOpen} title="Заполнить из выписки" description="CSV за 2–3 полных месяца">
        <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
          <p className="flex gap-2 rounded-xl bg-good/10 p-3 text-xs text-good">
            <ShieldCheck className="size-4 shrink-0" /> Файл не покидает браузер
          </p>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
          <Button type="button" variant="secondary" onClick={() => fileRef.current?.click()}>
            <Upload /> {table ? `Другой файл (сейчас: ${table.fileName})` : "Выбрать файл CSV"}
          </Button>
          {error && (
            <p role="alert" className="rounded-xl border border-warn/30 bg-warn/10 p-3 text-sm text-warn">
              {error}
            </p>
          )}

          {table && (
            <div className="grid grid-cols-2 gap-2">
              {COLS.map((c) => (
                <label key={c.key} className="space-y-1 text-xs text-muted">
                  {c.label}
                  <select
                    className={cn(inputClass, "h-9 py-0")}
                    value={table.map[c.key] ?? ""}
                    onChange={(e) => setTable({ ...table, map: { ...table.map, [c.key]: e.target.value === "" ? null : Number(e.target.value) } })}
                  >
                    <option value="">— нет —</option>
                    {table.rows[table.header].map((h, i) => (
                      <option key={i} value={i}>
                        {h || `Колонка ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          )}

          {sum && (
            <>
              <p className="text-sm">
                Операций: <b>{sum.operations}</b> за <b>{pluralMonths(sum.months)}</b>
                {sum.from && sum.to && ` (${sum.from.toLocaleDateString("ru-RU")} — ${sum.to.toLocaleDateString("ru-RU")})`}. В среднем за месяц:
              </p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {(["income", "fixed", "variable", "debt"] as FlowKind[]).map((k) => (
                  <div key={k} className="rounded-xl bg-surface-2/60 p-2.5">
                    <div className="text-xs text-muted">{FLOW_KIND_LABELS[k]}</div>
                    <div className="num font-semibold">{formatRub(sum.monthly[k])}</div>
                  </div>
                ))}
              </div>
              <div>
                <p className="mb-2 text-xs font-medium text-muted">Категории</p>
                <ul className="space-y-1.5">
                  {sum.categories.slice(0, 40).map((c) => (
                    <li key={c.key} className="flex items-center gap-2 text-sm">
                      <span className="min-w-0 flex-1 truncate" title={c.key}>
                        {c.key}
                      </span>
                      <span className="num shrink-0 text-xs text-muted">{formatRub(c.total)}</span>
                      <select
                        aria-label={`Куда отнести «${c.key}»`}
                        className={cn(inputClass, "h-8 w-36 shrink-0 py-0 text-xs")}
                        value={kinds[c.key] ?? c.kind}
                        onChange={(e) => setKinds({ ...kinds, [c.key]: e.target.value as FlowKind })}
                      >
                        {(c.sign > 0 ? (["income", "skip"] as FlowKind[]) : (["fixed", "variable", "debt", "skip"] as FlowKind[])).map((k) => (
                          <option key={k} value={k}>
                            {FLOW_KIND_LABELS[k]}
                          </option>
                        ))}
                      </select>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                  Отмена
                </Button>
                <Button type="button" onClick={apply}>
                  Подставить цифры
                </Button>
              </div>
            </>
          )}
        </div>
      </Dialog>
    </>
  );
}
