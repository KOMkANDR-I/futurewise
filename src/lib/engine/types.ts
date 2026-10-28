/**
 * Типы расчётного ядра FUTUREWISE.
 * Все денежные величины — рубли, все периоды — календарные месяцы модели (1…horizon).
 * Ядро не зависит от UI и языковой модели.
 */

export type ScenarioKind =
  | "purchase"
  | "installment"
  | "loan"
  | "income_change"
  | "relocation"
  | "cushion"
  | "custom";

export type Financing = "cash" | "installment" | "loan";

/** Режимы краш-теста. base — без событий, adverse — события уровня «неблагоприятный», stress — все включённые события. */
export type Mode = "base" | "adverse" | "stress";

export interface Finances {
  /** Основной ежемесячный доход (после налогов). */
  income: number;
  /** Дополнительные ежемесячные доходы. */
  extraIncome: number;
  /** Обязательные ежемесячные расходы (жильё, связь, транспорт…). */
  fixedExpenses: number;
  /** Переменные ежемесячные расходы (еда, досуг…). */
  variableExpenses: number;
  /** Текущие накопления — стартовый остаток. */
  savings: number;
  /** Прочие обязательные платежи без срока (для старых сценариев; новые лучше задавать списком debts). */
  existingPayments: number;
  /** Минимальный резерв, который пользователь хочет сохранить. */
  minReserve: number;
  /** Действующие кредиты, рассрочки и карты — у каждого свой платёж и срок. */
  debts?: Debt[];
}

export interface Debt {
  id: string;
  name: string;
  kind: "loan" | "installment" | "card" | "other";
  monthlyPayment: number;
  /** Сколько платежей осталось, считая с 1-го месяца. 0 — без срока (до конца расчёта). */
  monthsLeft: number;
  /** День списания (1–28). null — общий день платежей из настроек. */
  day: number | null;
}

export interface EarlyRepayment {
  id: string;
  /** Месяц модели, в котором вносится досрочный платёж. */
  month: number;
  amount: number;
  /** term — сокращаем срок, payment — уменьшаем ежемесячный платёж. */
  mode: "term" | "payment";
}

export interface Goal {
  id: string;
  name: string;
  amount: number;
  /** К какому месяцу хочется накопить. null — без срока. */
  targetMonth: number | null;
}

export interface Decision {
  /** Стоимость покупки / цели; для сценария «кредит» — сумма кредита. */
  price: number;
  /** Первоначальный взнос (для рассрочки и кредита на покупку). */
  downPayment: number;
  /** Способ оплаты (для покупки, рассрочки, кредита). */
  financing: Financing;
  /** Месяц исполнения решения (1 — первый месяц модели). Больше 1 — решение отложено. */
  startMonth: number;
  /** Первый регулярный платёж в месяц покупки (иначе — со следующего месяца). */
  firstPaymentNow: boolean;
  /** Условия рассрочки. monthlyPayment = null — не известен, считается равными долями. */
  installment: { months: number; monthlyPayment: number | null; fees: number };
  /** Условия кредита. monthlyPayment = null — считается по аннуитетной формуле. */
  loan: {
    months: number;
    annualRate: number;
    oneTimeFees: number;
    monthlyFees: number;
    monthlyPayment: number | null;
    /** Для сценария «кредит»: деньги сразу тратятся на цель (spend) или остаются на счёте (keep). */
    proceedsUse: "spend" | "keep";
    /** Аннуитетные (равные) или дифференцированные (убывающие) платежи. По умолчанию — аннуитет. */
    repayment?: "annuity" | "differentiated";
    /** Досрочные погашения. */
    early?: EarlyRepayment[];
  };
  /** Изменение дохода / переезд: новый основной доход с месяца startMonth (null — без изменений). */
  newIncome: number | null;
  /** Изменение дохода: число месяцев без основного дохода начиная со startMonth. */
  incomeGapMonths: number;
  /** Разовые затраты в месяц startMonth (переезд, обучение, собственный сценарий). */
  oneTimeCost: number;
  /** Изменение регулярных расходов с месяца startMonth (может быть отрицательным). */
  monthlyCostDelta: number;
  /** Длительность изменения регулярных расходов, мес. 0 — до конца горизонта. */
  recurringMonths: number;
  /** Цель финансовой подушки (для сценария «подушка»). */
  cushionTarget: number;
}

export type StressEventType =
  | "income_drop"
  | "extra_income_loss"
  | "unexpected_expense"
  | "expense_increase"
  | "new_payment"
  | "income_delay";

export interface StressEvent {
  id: string;
  type: StressEventType;
  enabled: boolean;
  /** В каком режиме событие начинает действовать: adverse (и далее в stress) или только stress. */
  tier: "adverse" | "stress";
  /**
   * Размер события. Единицы зависят от типа:
   * income_drop, extra_income_loss, expense_increase — %;
   * unexpected_expense — ₽ разово; new_payment — ₽ в месяц; income_delay — на сколько месяцев задерживается доход.
   */
  value: number;
  /** Месяц наступления (1…horizon). */
  month: number;
  /** Длительность, мес. Для неожиданного расхода не используется. Для задержки — сколько месячных поступлений задерживается. */
  duration: number;
  /** Вероятность, %, если пользователь её знает. null — режим «что, если», вероятность не оценивается. */
  probability: number | null;
}

/** Расширенные допущения модели. Все поля необязательны для обратной совместимости сохранённых сценариев. */
export interface ModelSettings {
  /** Годовая инфляция регулярных расходов, %. Платежи по кредитам и рассрочкам не индексируются. */
  inflationPct: number;
  /** Годовая индексация основного и дополнительного дохода, %. */
  incomeIndexPct: number;
  /** Годовая ставка на положительный остаток (вклад/накопительный счёт), %; начисляется ежемесячно. */
  savingsRatePct: number;
  /** month — проверка остатка только на конец месяца; payday — дневная модель внутри месяца. */
  cashTiming: "month" | "payday";
  /** День поступления дохода (1–28). */
  payday: number;
  /** День списания платежей (1–28). */
  paymentDay: number;
  /** На сколько процентов в любую сторону может «плавать» доход из месяца в месяц. */
  incomeVarPct?: number;
  /** На сколько процентов в любую сторону могут «плавать» обычные расходы. */
  expenseVarPct?: number;
}

export interface ModelInput {
  kind: ScenarioKind;
  finances: Finances;
  decision: Decision;
  /** Горизонт моделирования, мес. */
  horizon: number;
  events: StressEvent[];
  settings?: ModelSettings;
  /** Цели накоплений (по порядку приоритета). */
  goals?: Goal[];
}

/** Денежный поток решения: amounts[i] приходится на месяц (month + i). */
export interface Flow {
  label: string;
  type: "in" | "out";
  month: number;
  amounts: number[];
  /** Обязательный платёж по долгу (учитывается в долговой нагрузке). */
  debt?: boolean;
}

/** Операция внутри месяца для дневной модели и календаря. */
export interface DayOp {
  day: number;
  /** Плюс — поступление, минус — списание. */
  amount: number;
  label: string;
  kind: "income" | "debt" | "decision" | "event" | "interest";
}

export interface DecisionPlan {
  flows: Flow[];
  incomeChange: { fromMonth: number; gapMonths: number; newIncome: number | null } | null;
  recurringCost: { fromMonth: number; months: number; amount: number } | null;
  /** Ежемесячный платёж по решению (рассрочка/кредит), включая ежемесячные комиссии. */
  monthlyPayment: number | null;
  termMonths: number | null;
  firstPaymentMonth: number | null;
  financedAmount: number;
  /** Все деньги, которые уйдут на решение за весь срок (не только в горизонте). */
  totalCost: number;
  /** Переплата сверх стоимости: проценты + комиссии. */
  overpayment: number;
  /** Месяц, в котором решение исполняется (покупка совершена). */
  acquireMonth: number | null;
  /** Полная стоимость кредита, % годовых (по формуле ЦБ для ежемесячных платежей). */
  psk: number | null;
  /** График погашения кредита (для показа). */
  loanSchedule: { month: number; payment: number; interest: number; principal: number; extra: number; balance: number }[] | null;
  /** Сколько процентов экономят досрочные погашения. */
  interestSaved: number;
  considered: string[];
  unknown: string[];
  assumptions: string[];
  warnings: string[];
}

export interface MonthRow {
  month: number;
  start: number;
  income: number;
  extraIncome: number;
  decisionIn: number;
  expenses: number;
  payments: number;
  decisionOut: number;
  eventCosts: number;
  /** Сколько основного и доп. дохода не поступило в этом месяце из-за событий (для объяснений). */
  incomeLost: number;
  /** Проценты на остаток, начисленные в этом месяце. */
  interest: number;
  inflows: number;
  outflows: number;
  end: number;
  /**
   * Самая низкая точка месяца, по которой проверяются резерв и дефицит.
   * В месячном режиме равна end; в дневном — минимум остатка внутри месяца.
   */
  lowPoint: number;
  belowReserve: boolean;
  belowZero: boolean;
  activeEvents: string[];
  /** Обязательные платежи по долгам в этом месяце (кредиты, рассрочки, новые платежи). */
  debtPayments: number;
  /** Из них — платежи по самому решению (кредит, рассрочка). */
  decisionDebt: number;
  /** Долговая нагрузка: платежи по долгам / доход месяца. null — дохода нет. */
  pdn: number | null;
  /** План месяца по дням: точечные операции и равномерные траты в день. */
  dayPlan: { spreadPerDay: number; ops: DayOp[] };
}

export type Status = "ok" | "reserve" | "deficit";

export interface Metrics {
  startBalance: number;
  endBalance: number;
  minBalance: number;
  minMonth: number;
  firstDeficitMonth: number | null;
  firstReserveBreachMonth: number | null;
  deficitMonths: number;
  reserveBreachMonths: number;
  /** Сколько не хватает до нулевого остатка в худший месяц. */
  deficitShortfall: number;
  /** Сколько не хватает до минимального резерва в худший месяц. */
  reserveShortfall: number;
  totalInflows: number;
  totalOutflows: number;
  decisionPaidInHorizon: number;
  eventCosts: number;
  incomeLost: number;
  status: Status;
  /** Самая высокая долговая нагрузка за срок расчёта (доля, 0.5 = 50%). null — нет данных. */
  pdnMax: number | null;
  pdnMaxMonth: number | null;
}

export interface SimulationResult {
  rows: MonthRow[];
  metrics: Metrics;
  eventIds: string[];
}

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: ValidationIssue[];
  warnings: string[];
}

export interface CrashTestResult {
  validation: ValidationResult;
  plan: DecisionPlan;
  modes: Record<Mode, SimulationResult>;
  /** Влияние каждого включённого события по отдельности (поверх базового сценария). */
  eventImpacts: { eventId: string; label: string; minBalanceDelta: number; result: SimulationResult }[];
  assumptions: string[];
}
