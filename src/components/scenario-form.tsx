"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, FormProvider, useForm, useFormContext, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ArrowLeft,
  ArrowRight,
  Banknote,
  Briefcase,
  CreditCard,
  Home,
  Laptop,
  PiggyBank,
  Play,
  ShieldAlert,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import {
  annuityPayment,
  defaultDecision,
  FINANCING_LABELS,
  KIND_META,
  modelSchema,
  runCrashTest,
  STATUS_META,
  validateModel,
  type Financing,
  type ModelInput,
  type ScenarioKind,
} from "@/lib/engine";
import { Button } from "@/components/ui/button";
import { Badge, Card, Field, Input, NumberInput, Segmented, statusTone, Switch } from "@/components/ui/primitives";
import { MODE_META } from "@/lib/engine";
import { EventsEditor } from "@/components/events-editor";
import { AdvancedSettings } from "@/components/workspace/params-panel";
import { DebtsEditor, EarlyEditor } from "@/components/list-editors";
import { StatementImport, type StatementApply } from "@/components/statement-import";
import type { Debt, EarlyRepayment } from "@/lib/engine";
import { createScenario, updateScenario } from "@/lib/store";
import { formatRub } from "@/lib/format";
import { cn, scenarioHref } from "@/lib/utils";

const formSchema = z.object({ title: z.string().trim().min(1, "Придумайте название").max(80, "Не длиннее 80 символов"), model: modelSchema });
type FormValues = z.infer<typeof formSchema>;

const KIND_ICONS: Record<ScenarioKind, LucideIcon> = {
  purchase: Laptop,
  installment: CreditCard,
  loan: Banknote,
  income_change: Briefcase,
  relocation: Home,
  cushion: PiggyBank,
  custom: Sparkles,
};

const STEPS = ["Что задумали", "Ваши деньги", "Подробности", "Что может пойти не так"];

function NumField({ name, label, hint, suffix = "₽", allowEmpty, placeholder, min = 0, max }: { name: string; label: string; hint?: string; suffix?: string; allowEmpty?: boolean; placeholder?: string; min?: number; max?: number }) {
  const { control } = useFormContext<FormValues>();
  const id = `f-${name.replace(/\./g, "-")}`;
  return (
    <Controller
      control={control}
      name={name as never}
      render={({ field, fieldState }) => (
        <Field label={label} hint={hint} error={fieldState.error?.message} htmlFor={id}>
          <NumberInput id={id} value={field.value as number | null} onChange={field.onChange} allowEmpty={allowEmpty} suffix={suffix} placeholder={placeholder} min={min} max={max} invalid={!!fieldState.error} />
        </Field>
      )}
    />
  );
}

function KindStep() {
  const { setValue, control } = useFormContext<FormValues>();
  const kind = useWatch({ control, name: "model.kind" });
  return (
    <div role="radiogroup" aria-label="Тип ситуации" className="grid gap-3 sm:grid-cols-2">
      {(Object.keys(KIND_META) as ScenarioKind[]).map((k) => {
        const Icon = KIND_ICONS[k];
        const active = k === kind;
        return (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => {
              setValue("model.kind", k, { shouldDirty: true });
              setValue("model.decision", defaultDecision(k), { shouldDirty: true });
            }}
            className={cn("flex items-start gap-3 rounded-2xl border p-4 text-left transition hover:border-accent/60", active ? "border-accent bg-accent/5 ring-1 ring-accent" : "bg-surface-2/30")}
          >
            <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", active ? "bg-accent text-accent-fg" : "bg-surface-2 text-muted")}>
              <Icon className="size-5" />
            </span>
            <span>
              <span className="block font-semibold">{KIND_META[k].label}</span>
              <span className="mt-0.5 block text-sm text-muted">{KIND_META[k].hint}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function FinancesStep() {
  const { control, setValue, getValues } = useFormContext<FormValues>();
  const existing = useWatch({ control, name: "model.finances.existingPayments" });
  const applyStatement = (v: StatementApply) => {
    setValue("model.finances.income", v.income, { shouldDirty: true, shouldValidate: true });
    setValue("model.finances.extraIncome", 0, { shouldDirty: true });
    setValue("model.finances.fixedExpenses", v.fixedExpenses, { shouldDirty: true, shouldValidate: true });
    setValue("model.finances.variableExpenses", v.variableExpenses, { shouldDirty: true, shouldValidate: true });
    if (v.debtPayments > 0) {
      const debts = (getValues("model.finances.debts") ?? []) as Debt[];
      setValue("model.finances.debts", [...debts, { id: `debt_${Date.now().toString(36)}`, name: "Кредиты из выписки", kind: "loan", monthlyPayment: v.debtPayments, monthsLeft: 0, day: null }], { shouldDirty: true });
    }
  };
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-accent/30 bg-accent/5 p-4">
        <p className="text-sm text-muted">Заполнить из банковской выписки</p>
        <StatementImport onApply={applyStatement} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <NumField name="model.finances.income" label="Зарплата в месяц" hint="На руки" />
        <NumField name="model.finances.extraIncome" label="Подработка и другие доходы" />
        <NumField name="model.finances.fixedExpenses" label="Обязательные расходы" hint="Без кредитов" />
        <NumField name="model.finances.variableExpenses" label="Расходы на жизнь" />
        <NumField name="model.finances.savings" label="Сколько уже накоплено" />
        {existing > 0 && <NumField name="model.finances.existingPayments" label="Прочие обязательные платежи" />}
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">Кредиты и рассрочки, которые уже есть</p>
        <Controller control={control} name="model.finances.debts" render={({ field }) => <DebtsEditor debts={(field.value ?? []) as Debt[]} onChange={field.onChange} />} />
      </div>
      <div className="rounded-2xl border border-violet/30 bg-violet/5 p-4">
        <NumField name="model.finances.minReserve" label="Запас, который не трогаем" />
      </div>
    </div>
  );
}

function DecisionStep() {
  const { control, setValue } = useFormContext<FormValues>();
  const kind = useWatch({ control, name: "model.kind" });
  const d = useWatch({ control, name: "model.decision" });
  const horizon = useWatch({ control, name: "model.horizon" });
  const financing: Financing | null = kind === "installment" ? "installment" : kind === "loan" ? "loan" : kind === "purchase" ? d.financing : null;
  const startField = (label = "В каком месяце", hint = "1 — сейчас") => <NumField name="model.decision.startMonth" label={label} hint={hint} suffix="мес" min={1} max={120} />;

  const annuity = useMemo(() => {
    if (financing !== "loan") return null;
    const principal = kind === "loan" ? d.price : Math.max(0, d.price - d.downPayment);
    try {
      return principal > 0 && d.loan.months > 0 ? annuityPayment(principal, d.loan.annualRate, d.loan.months) : null;
    } catch {
      return null;
    }
  }, [financing, kind, d.price, d.downPayment, d.loan.months, d.loan.annualRate]);

  return (
    <div className="space-y-6">
      {kind === "purchase" && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Как будете платить?</p>
          <Segmented
            label="Способ оплаты"
            value={d.financing}
            onChange={(v) => setValue("model.decision.financing", v, { shouldDirty: true })}
            options={(["cash", "installment", "loan"] as Financing[]).map((f) => ({ value: f, label: FINANCING_LABELS[f] }))}
          />
        </div>
      )}

      {(kind === "purchase" || kind === "installment") && (
        <div className="grid gap-4 sm:grid-cols-2">
          <NumField name="model.decision.price" label="Цена" />
          {financing === "cash" ? startField("В каком месяце купите", "1 — сразу; больше 1 — сначала накопите") : <NumField name="model.decision.downPayment" label="Первый взнос" />}
        </div>
      )}

      {financing === "installment" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <NumField name="model.decision.installment.monthlyPayment" label="Платёж в месяц" allowEmpty placeholder="поровну" />
          <NumField name="model.decision.installment.months" label="На сколько месяцев" suffix="мес" min={1} max={120} />
          <NumField name="model.decision.installment.fees" label="Комиссия, если есть" />
          {kind === "installment" && startField("В каком месяце купите")}
        </div>
      )}

      {financing === "loan" && (
        <div className="grid gap-4 sm:grid-cols-2">
          {kind === "loan" ? <NumField name="model.decision.price" label="Сколько берёте в кредит" /> : <NumField name="model.decision.downPayment" label="Первый взнос" hint={`В кредит: ${formatRub(Math.max(0, d.price - d.downPayment))}`} />}
          <NumField name="model.decision.loan.months" label="На сколько месяцев" suffix="мес" min={1} max={360} />
          <NumField name="model.decision.loan.annualRate" label="Ставка, % в год" suffix="%" max={100} />
          <NumField
            name="model.decision.loan.monthlyPayment"
            label="Платёж в месяц, если знаете"
            allowEmpty
            placeholder={annuity ? `по расчёту: ${formatRub(annuity)}` : "посчитаем сами"}
          />
          <NumField name="model.decision.loan.oneTimeFees" label="Разовые комиссии" />
          <NumField name="model.decision.loan.monthlyFees" label="Страховка и комиссии в месяц" />
          <div className="space-y-2 sm:col-span-2">
            <p className="text-sm font-medium">Как гасите кредит</p>
            <Segmented
              label="Вид платежей"
              value={d.loan.repayment ?? "annuity"}
              onChange={(v) => setValue("model.decision.loan.repayment", v, { shouldDirty: true })}
              options={[
                { value: "annuity", label: "Равными платежами" },
                { value: "differentiated", label: "Убывающими платежами" },
              ]}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <p className="text-sm font-medium">Досрочное погашение</p>
            <Controller control={control} name="model.decision.loan.early" render={({ field }) => <EarlyEditor early={(field.value ?? []) as EarlyRepayment[]} onChange={field.onChange} horizon={horizon} />} />
          </div>
          {kind === "loan" && (
            <div className="space-y-2 sm:col-span-2">
              <p className="text-sm font-medium">Что будет с деньгами</p>
              <Segmented
                label="Использование кредита"
                value={d.loan.proceedsUse}
                onChange={(v) => setValue("model.decision.loan.proceedsUse", v, { shouldDirty: true })}
                options={[
                  { value: "spend", label: "Сразу потрачу на покупку" },
                  { value: "keep", label: "Оставлю на счёте" },
                ]}
              />
            </div>
          )}
          {kind === "loan" && startField("В каком месяце берёте кредит")}
        </div>
      )}

      {financing && financing !== "cash" && (
        <Controller
          control={control}
          name="model.decision.firstPaymentNow"
          render={({ field }) => (
            <label className="flex items-center gap-3 text-sm">
              <Switch checked={field.value} onCheckedChange={field.onChange} />
              Первый платёж — в том же месяце (иначе со следующего)
            </label>
          )}
        />
      )}

      {kind === "income_change" && (
        <div className="grid gap-4 sm:grid-cols-2">
          {startField("В каком месяце переходите")}
          <NumField name="model.decision.newIncome" label="Новая зарплата" allowEmpty placeholder="такая же" />
          <NumField name="model.decision.incomeGapMonths" label="Сколько месяцев без зарплаты" suffix="мес" max={120} />
          <NumField name="model.decision.oneTimeCost" label="Разовые траты на переход" />
        </div>
      )}

      {(kind === "relocation" || kind === "custom") && (
        <div className="grid gap-4 sm:grid-cols-2">
          {startField(kind === "relocation" ? "В каком месяце переезжаете" : "С какого месяца")}
          <NumField name="model.decision.oneTimeCost" label={kind === "relocation" ? "Разовые траты (переезд, залог)" : "Разовая трата"} />
          <NumField name="model.decision.monthlyCostDelta" label="На сколько изменятся расходы в месяц" min={-1_000_000_000} hint="Дешевле — с минусом" />
          {kind === "custom" ? (
            <NumField name="model.decision.recurringMonths" label="Сколько месяцев" suffix="мес" max={360} hint="0 — до конца расчёта" />
          ) : (
            <NumField name="model.decision.newIncome" label="Зарплата после переезда" allowEmpty placeholder="такая же" />
          )}
        </div>
      )}

      {kind === "cushion" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <NumField name="model.decision.cushionTarget" label="Сколько хотите накопить" />
        </div>
      )}
    </div>
  );
}

function StressStep() {
  const { control, getValues, setValue } = useFormContext<FormValues>();
  const horizon = useWatch({ control, name: "model.horizon" });
  const model = useWatch({ control, name: "model" }) as ModelInput;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <NumField name="model.horizon" label="На сколько месяцев вперёд считать" suffix="мес" min={1} max={60} />
      </div>
      <Controller control={control} name="model.events" render={({ field }) => <EventsEditor events={field.value} onChange={field.onChange} horizon={horizon || 12} />} />
      <div className="rounded-2xl border p-4">
        <AdvancedSettings
          model={model}
          upd={(fn) => {
            const m = structuredClone(getValues("model")) as ModelInput;
            fn(m);
            setValue("model.settings", m.settings, { shouldDirty: true });
          }}
        />
      </div>
    </div>
  );
}

function LivePreview() {
  const { control } = useFormContext<FormValues>();
  const model = useWatch({ control, name: "model" }) as ModelInput;
  const res = useMemo(() => {
    const v = validateModel(model);
    if (!v.ok) return { error: v.errors[0]?.message };
    return { result: runCrashTest(model) };
  }, [model]);
  return (
    <Card className="p-5">
      <p className="eyebrow">Предварительный итог</p>
      {"error" in res && res.error ? (
        <p className="mt-3 text-sm text-warn">{res.error}</p>
      ) : res.result ? (
        <div className="mt-3 space-y-3">
          {(["base", "adverse", "stress"] as const).map((m) => {
            const x = res.result!.modes[m].metrics;
            return (
              <div key={m} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-muted">{MODE_META[m].label}</span>
                <span className="flex items-center gap-2">
                  <span className="num font-semibold">{formatRub(x.minBalance)}</span>
                  <Badge tone={statusTone(x.status)}>{STATUS_META[x.status].label}</Badge>
                </span>
              </div>
            );
          })}
        </div>
      ) : null}
    </Card>
  );
}

export function ScenarioForm({ initial, editId }: { initial: { title: string; model: ModelInput }; editId?: string }) {
  const router = useRouter();
  const [step, setStep] = useState(editId ? 1 : 0);
  const [submitErrors, setSubmitErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const methods = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: initial, mode: "onChange" });

  const fieldsByStep: (keyof FormValues | `model.${string}`)[][] = [["title", "model.kind"], ["model.finances"], ["model.decision"], ["model.horizon", "model.events"]];

  const next = async () => {
    const ok = await methods.trigger(fieldsByStep[step] as never);
    if (!ok) return;
    if (step === 2) {
      const v = validateModel(methods.getValues("model") as ModelInput);
      const errs = v.errors.filter((e) => e.path.startsWith("decision"));
      if (errs.length) {
        setSubmitErrors(errs.map((e) => e.message));
        return;
      }
    }
    setSubmitErrors([]);
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submit = methods.handleSubmit(
    (values) => {
      const model = values.model as ModelInput;
      const v = validateModel(model);
      if (!v.ok) {
        setSubmitErrors(v.errors.map((e) => e.message));
        return;
      }
      setSubmitting(true);
      let id = editId;
      if (editId) updateScenario(editId, { title: values.title, model });
      else id = createScenario(values.title, model).id;
      router.push(scenarioHref(id!));
    },
    () => setSubmitErrors(["Проверьте поля, отмеченные красным."]),
  );
  // Enter в поле на промежуточном шаге ведёт к следующему шагу, а не к запуску расчёта.
  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (step < STEPS.length - 1) void next();
    else void submit(e);
  };

  return (
    <FormProvider {...methods}>
      <form onSubmit={onSubmit} noValidate className="container grid gap-8 py-10 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0">
          <p className="eyebrow">{editId ? "Правка сценария" : "Новый сценарий"}</p>
          <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">{STEPS[step]}</h1>
          <ol className="mt-6 grid grid-cols-4 gap-2" aria-label="Шаги">
            {STEPS.map((s, i) => (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => (i < step ? setStep(i) : undefined)}
                  disabled={i > step}
                  aria-current={i === step ? "step" : undefined}
                  className="w-full text-left"
                >
                  <span className={cn("block h-1 rounded-full transition", i <= step ? "bg-accent" : "bg-surface-2")} />
                  <span className={cn("mt-2 hidden text-xs font-medium sm:block", i === step ? "text-fg" : "text-muted")}>
                    {i + 1}. {s}
                  </span>
                </button>
              </li>
            ))}
          </ol>

          <Card className="mt-6 p-5 sm:p-7">
            {step === 0 && (
              <div className="space-y-6">
                <Controller
                  control={methods.control}
                  name="title"
                  render={({ field, fieldState }) => (
                    <Field label="Как назовём" htmlFor="f-title" error={fieldState.error?.message}>
                      <Input id="f-title" {...field} placeholder="Например, «Ноутбук для учёбы»" aria-invalid={!!fieldState.error} maxLength={80} />
                    </Field>
                  )}
                />
                <KindStep />
              </div>
            )}
            {step === 1 && <FinancesStep />}
            {step === 2 && <DecisionStep />}
            {step === 3 && <StressStep />}

            {submitErrors.length > 0 && (
              <div role="alert" className="mt-6 flex gap-3 rounded-xl border border-bad/30 bg-bad/5 p-4 text-sm text-bad">
                <ShieldAlert className="size-5 shrink-0" />
                <ul className="space-y-1">
                  {submitErrors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
              <Button type="button" variant="ghost" onClick={() => (step === 0 ? router.back() : setStep(step - 1))}>
                <ArrowLeft /> {step === 0 ? "Отмена" : "Назад"}
              </Button>
              {step < STEPS.length - 1 ? (
                <Button key="next" type="button" onClick={next}>
                  Далее <ArrowRight />
                </Button>
              ) : (
                <Button key="submit" type="submit" size="lg" disabled={submitting}>
                  <Play /> {editId ? "Сохранить и пересчитать" : "Запустить краш-тест"}
                </Button>
              )}
            </div>
          </Card>
        </div>
        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          {step >= 1 && <LivePreview />}
        </aside>
      </form>
    </FormProvider>
  );
}
