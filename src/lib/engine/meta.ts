import type { Financing, Mode, ScenarioKind, Status, StressEvent, StressEventType } from "./types";
import { formatRub, fromMonth, inMonth, pluralMonths } from "../format";

export const KIND_META: Record<ScenarioKind, { label: string; hint: string }> = {
  purchase: { label: "Крупная покупка", hint: "Ноутбук, техника, ремонт — сразу, позже или частями" },
  installment: { label: "Покупка в рассрочку", hint: "Платите каждый месяц, без процентов или с комиссией" },
  loan: { label: "Кредит", hint: "Сумма, ставка и срок — платёж посчитаем сами" },
  income_change: { label: "Смена дохода", hint: "Новая работа, фриланс, перерыв без зарплаты" },
  relocation: { label: "Переезд", hint: "Траты на переезд и новая аренда" },
  cushion: { label: "Финансовая подушка", hint: "Когда накопите запас и выдержит ли он удар" },
  custom: { label: "Свой вариант", hint: "Любые разовые и регулярные траты" },
};

export const FINANCING_LABELS: Record<Financing, string> = {
  cash: "Сразу всей суммой",
  installment: "В рассрочку",
  loan: "В кредит",
};

/**
 * Три сценария проверки.
 * label — короткое название, phrase — как сказать об этом в предложении.
 */
export const MODE_META: Record<Mode, { label: string; short: string; phrase: string; where: string; description: string }> = {
  base: { label: "Обычный", short: "Обычный", phrase: "если всё пойдёт по плану", where: "в обычном сценарии", description: "Всё идёт по плану: доходы и расходы такие, как вы ввели." },
  adverse: { label: "Трудный", short: "Трудный", phrase: "если станет труднее", where: "в трудном сценарии", description: "Случаются события, которые вы отметили как «трудные»." },
  stress: { label: "Кризисный", short: "Кризис", phrase: "в кризисном случае", where: "в кризисном сценарии", description: "Случаются сразу все события, которые вы добавили." },
};

export const STATUS_META: Record<Status, { label: string; rule: string }> = {
  ok: { label: "Запас цел", rule: "Денег ни разу не становится меньше вашего запаса." },
  reserve: { label: "Запас тронут", rule: "В какой-то месяц денег становится меньше запаса, но в минус вы не уходите." },
  deficit: { label: "Не хватает денег", rule: "В какой-то месяц деньги заканчиваются — баланс уходит в минус." },
};

export const EVENT_META: Record<
  StressEventType,
  { label: string; unit: "%" | "₽" | "₽/мес" | "мес"; valueLabel: string; durationLabel: string | null; defaults: Pick<StressEvent, "value" | "month" | "duration"> }
> = {
  income_drop: { label: "Доход упал", unit: "%", valueLabel: "На сколько упадёт зарплата", durationLabel: "Сколько месяцев", defaults: { value: 20, month: 2, duration: 2 } },
  extra_income_loss: { label: "Пропала подработка", unit: "%", valueLabel: "Какая часть подработки пропадёт", durationLabel: "Сколько месяцев", defaults: { value: 100, month: 2, duration: 3 } },
  unexpected_expense: { label: "Непредвиденная трата", unit: "₽", valueLabel: "Сколько придётся потратить", durationLabel: null, defaults: { value: 15000, month: 3, duration: 1 } },
  expense_increase: { label: "Расходы выросли", unit: "%", valueLabel: "На сколько вырастут расходы", durationLabel: "Сколько месяцев", defaults: { value: 10, month: 3, duration: 6 } },
  new_payment: { label: "Новый платёж", unit: "₽/мес", valueLabel: "Сумма в месяц", durationLabel: "Сколько месяцев", defaults: { value: 5000, month: 4, duration: 6 } },
  income_delay: { label: "Задержка зарплаты", unit: "мес", valueLabel: "На сколько месяцев задержат", durationLabel: "Сколько зарплат задержат", defaults: { value: 1, month: 3, duration: 1 } },
};

export function describeEvent(e: StressEvent): string {
  const from = fromMonth(e.month);
  const len = pluralMonths(e.duration);
  switch (e.type) {
    case "income_drop":
      return `Доход меньше на ${e.value}% ${from}, ${len}`;
    case "extra_income_loss":
      return e.value >= 100 ? `Подработки нет ${from}, ${len}` : `Подработка меньше на ${e.value}% ${from}, ${len}`;
    case "unexpected_expense":
      return `Трата ${formatRub(e.value)} ${inMonth(e.month)}`;
    case "expense_increase":
      return `Расходы больше на ${e.value}% ${from}, ${len}`;
    case "new_payment":
      return `Новый платёж ${formatRub(e.value)} в месяц ${from}, ${len}`;
    case "income_delay":
      return `Зарплату задерживают на ${pluralMonths(e.value)} ${from}${e.duration > 1 ? ` (выплат: ${e.duration})` : ""}`;
  }
  return EVENT_META[(e as StressEvent).type]?.label ?? "Событие";
}
