import { z } from "zod";
import { formatRub, pluralMonths } from "../format";
import type { ModelInput, ValidationResult } from "./types";

const MAX_MONEY = 1_000_000_000;
const money = (label: string) =>
  z
    .number({ invalid_type_error: `${label}: введите число`, required_error: `${label}: обязательное поле` })
    .finite(`${label}: введите число`)
    .min(0, `${label}: не может быть отрицательным`)
    .max(MAX_MONEY, `${label}: слишком большое значение`);
const months = (label: string, min: number, max: number) =>
  z
    .number({ invalid_type_error: `${label}: введите число` })
    .int(`${label}: целое число месяцев`)
    .min(min, `${label}: не меньше ${min}`)
    .max(max, `${label}: не больше ${max}`);
const pct = (label: string) => z.number({ invalid_type_error: `${label}: введите число` }).min(0, `${label}: от 0%`).max(100, `${label}: до 100%`);

const day = (label: string) => z.number({ invalid_type_error: `${label}: введите число` }).int(`${label}: целое число`).min(1, `${label}: от 1`).max(28, `${label}: до 28`);

export const debtSchema = z.object({
  id: z.string().min(1),
  name: z.string().max(60, "Название долга — не длиннее 60 символов"),
  kind: z.enum(["loan", "installment", "card", "other"]),
  monthlyPayment: money("Платёж по долгу"),
  monthsLeft: months("Сколько платежей осталось", 0, 360),
  day: day("День списания").nullable(),
});

export const goalSchema = z.object({
  id: z.string().min(1),
  name: z.string().max(60, "Название цели — не длиннее 60 символов"),
  amount: money("Сумма цели"),
  targetMonth: months("Месяц цели", 1, 360).nullable(),
});

export const financesSchema = z.object({
  income: money("Ежемесячный доход"),
  extraIncome: money("Подработка"),
  fixedExpenses: money("Обязательные расходы"),
  variableExpenses: money("Переменные расходы"),
  savings: money("Текущие накопления"),
  existingPayments: money("Платежи по кредитам"),
  minReserve: money("Запас"),
  debts: z.array(debtSchema).max(30, "Не более 30 долгов").optional(),
});

export const decisionSchema = z.object({
  price: money("Цена"),
  downPayment: money("Первый взнос"),
  financing: z.enum(["cash", "installment", "loan"]),
  startMonth: months("Месяц решения", 1, 120),
  firstPaymentNow: z.boolean(),
  installment: z.object({
    months: months("Срок рассрочки", 1, 120),
    monthlyPayment: money("Ежемесячный платёж").nullable(),
    fees: money("Комиссии"),
  }),
  loan: z.object({
    months: months("Срок кредита", 1, 360),
    annualRate: pct("Ставка"),
    oneTimeFees: money("Разовые комиссии"),
    monthlyFees: money("Ежемесячные комиссии"),
    monthlyPayment: money("Ежемесячный платёж").nullable(),
    proceedsUse: z.enum(["spend", "keep"]),
    repayment: z.enum(["annuity", "differentiated"]).optional(),
    early: z
      .array(z.object({ id: z.string().min(1), month: months("Месяц досрочного платежа", 1, 360), amount: money("Сумма досрочного платежа"), mode: z.enum(["term", "payment"]) }))
      .max(24, "Не более 24 досрочных платежей")
      .optional(),
  }),
  newIncome: money("Новый доход").nullable(),
  incomeGapMonths: months("Месяцы без зарплаты", 0, 120),
  oneTimeCost: money("Разовые траты"),
  monthlyCostDelta: z.number().finite().min(-MAX_MONEY).max(MAX_MONEY),
  recurringMonths: months("Срок изменения расходов", 0, 360),
  cushionTarget: money("Цель подушки"),
});

export const eventSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["income_drop", "extra_income_loss", "unexpected_expense", "expense_increase", "new_payment", "income_delay"]),
  enabled: z.boolean(),
  tier: z.enum(["adverse", "stress"]),
  value: z.number().finite().min(0, "Размер события не может быть меньше нуля"),
  month: months("Месяц события", 1, 360),
  duration: months("Длительность события", 1, 360),
  probability: pct("Вероятность").nullable(),
});

export const settingsSchema = z.object({
  inflationPct: z.number().finite().min(-20, "Инфляция: от −20%").max(100, "Инфляция: до 100%"),
  incomeIndexPct: z.number().finite().min(-50, "Рост дохода: от −50%").max(100, "Рост дохода: до 100%"),
  savingsRatePct: pct("Процент по вкладу"),
  cashTiming: z.enum(["month", "payday"]),
  payday: day("День зарплаты"),
  paymentDay: day("День платежей"),
  incomeVarPct: z.number().finite().min(0, "Разброс дохода: от 0%").max(50, "Разброс дохода: до 50%").optional(),
  expenseVarPct: z.number().finite().min(0, "Разброс расходов: от 0%").max(50, "Разброс расходов: до 50%").optional(),
});

export const modelSchema = z.object({
  settings: settingsSchema.optional(),
  kind: z.enum(["purchase", "installment", "loan", "income_change", "relocation", "cushion", "custom"]),
  finances: financesSchema,
  decision: decisionSchema,
  horizon: months("Срок расчёта", 1, 60),
  events: z.array(eventSchema).max(20, "Не более 20 событий"),
  goals: z.array(goalSchema).max(10, "Не более 10 целей").optional(),
});

/** Полная проверка модели: ошибки блокируют расчёт, предупреждения объясняют допущения. */
export function validateModel(model: ModelInput): ValidationResult {
  const parsed = modelSchema.safeParse(model);
  const errors = parsed.success
    ? []
    : parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
  const warnings: string[] = [];
  if (!parsed.success) return { ok: false, errors, warnings };

  const { finances: f, decision: d, kind, horizon } = model;
  const purchaseLike = kind === "purchase" || kind === "installment" || kind === "loan";
  const financing = kind === "installment" ? "installment" : kind === "loan" ? "loan" : kind === "purchase" ? d.financing : null;

  if (purchaseLike && d.price <= 0) errors.push({ path: "decision.price", message: kind === "loan" ? "Укажите сумму кредита" : "Укажите стоимость покупки" });
  if ((financing === "installment" || (financing === "loan" && kind !== "loan")) && d.downPayment > d.price)
    errors.push({ path: "decision.downPayment", message: "Первый взнос не может быть больше цены" });
  if (kind === "cushion" && d.cushionTarget <= 0) errors.push({ path: "decision.cushionTarget", message: "Укажите, какую подушку хотите накопить" });

  for (const e of model.events) {
    if ((e.type === "income_drop" || e.type === "extra_income_loss" || e.type === "expense_increase") && e.value > 100)
      errors.push({ path: `events.${e.id}.value`, message: "Процент не может быть больше 100" });
    if (e.enabled && e.month > horizon) warnings.push(`Событие в ${e.month}-м месяце не попадёт в расчёт: вы считаете только ${pluralMonths(horizon)} вперёд.`);
    if (e.type === "extra_income_loss" && e.enabled && f.extraIncome === 0) warnings.push("Событие «Пропала подработка» ни на что не влияет: подработки у вас нет.");
  }

  if (f.income + f.extraIncome === 0) warnings.push("Дохода нет — посчитаем, на сколько месяцев хватит накоплений.");
  if (f.savings < f.minReserve) warnings.push(`Ваши накопления (${formatRub(f.savings)}) уже меньше запаса, который вы хотите сохранить (${formatRub(f.minReserve)}).`);
  if (f.existingPayments > 0) warnings.push("Платежи по кредитам считаются отдельно. Проверьте, что вы не включили их ещё и в обязательные расходы — иначе они посчитаются дважды.");
  if (kind === "income_change" && d.newIncome == null && d.incomeGapMonths === 0) warnings.push("Вы не указали ни новый доход, ни перерыв без зарплаты — расчёт не изменится.");

  return { ok: errors.length === 0, errors, warnings };
}
