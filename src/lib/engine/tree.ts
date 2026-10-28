import { buildDecisionPlan } from "./decision";
import { describeEvent, EVENT_META, KIND_META } from "./meta";
import { eventsForMode, simulateWith } from "./simulate";
import { cap, formatRub, fromMonth, inMonth } from "../format";
import type { Metrics, ModelInput, Status, StressEvent } from "./types";

export interface TreeAction {
  label: string;
  detail: string;
  /** Что именно поменять в модели, чтобы проверить действие. */
  apply: { type: "addSavings"; amount: number } | { type: "deferTo"; month: number } | { type: "none" };
}

export interface TreeNode {
  id: string;
  kind: "root" | "branch" | "outcome" | "action";
  title: string;
  condition?: string;
  metrics?: Metrics;
  status: Status | "info";
  month?: number | null;
  eventIds: string[];
  action?: TreeAction;
  children: TreeNode[];
}

/** Минимальная отсрочка решения, устраняющая нарушение при заданном наборе событий (перебор по месяцам). */
function findDeferFix(model: ModelInput, events: StressEvent[]): number | null {
  if (model.kind === "cushion") return null;
  for (let m = model.decision.startMonth + 1; m <= model.horizon; m++) {
    const alt: ModelInput = { ...model, decision: { ...model.decision, startMonth: m } };
    if (simulateWith(alt, events).metrics.minBalance >= model.finances.minReserve) return m;
  }
  return null;
}

function outcomeNodes(id: string, model: ModelInput, events: StressEvent[], metrics: Metrics): TreeNode[] {
  const reserve = model.finances.minReserve;
  const nodes: TreeNode[] = [];
  if (metrics.status === "ok") {
    nodes.push({
      id: `${id}-o1`,
      kind: "outcome",
      title: "Запас цел",
      condition: `Меньше всего денег — ${formatRub(metrics.minBalance)} ${inMonth(metrics.minMonth)}`,
      metrics,
      status: "ok",
      month: metrics.minMonth,
      eventIds: events.map((e) => e.id),
      children: [],
    });
    const margin = metrics.minBalance - reserve;
    nodes.push({
      id: `${id}-a`,
      kind: "action",
      title: "Ещё можно потратить",
      condition: `До ${formatRub(margin)} на непредвиденное — и запас цел`,
      status: "info",
      eventIds: [],
      action: { label: "Ещё можно потратить", detail: `Даже в самый трудный момент у вас на ${formatRub(margin)} больше, чем ваш запас.`, apply: { type: "none" } },
      children: [],
    });
    return nodes;
  }
  nodes.push({
    id: `${id}-o1`,
    kind: "outcome",
    title: metrics.status === "deficit" ? "Денег не хватит" : "Запас тронут",
    condition:
      metrics.status === "deficit"
        ? `${cap(fromMonth(metrics.firstDeficitMonth!))}, минус до ${formatRub(metrics.minBalance)}`
        : `${cap(fromMonth(metrics.firstReserveBreachMonth!))}, остаётся ${formatRub(metrics.minBalance)}`,
    metrics,
    status: metrics.status,
    month: metrics.status === "deficit" ? metrics.firstDeficitMonth : metrics.firstReserveBreachMonth,
    eventIds: events.map((e) => e.id),
    children: [],
  });
  const defer = findDeferFix(model, events);
  const action: TreeAction =
    defer != null
      ? { label: `Подождать до ${defer}-го месяца`, detail: `Если сделать это ${inMonth(defer)}, запас останется цел.`, apply: { type: "deferTo", month: defer } }
      : {
          label: `Отложить ещё ${formatRub(metrics.reserveShortfall)}`,
          detail: `Чтобы запас остался цел, к накоплениям нужно добавить ${formatRub(metrics.reserveShortfall)}.`,
          apply: { type: "addSavings", amount: metrics.reserveShortfall },
        };
  nodes.push({
    id: `${id}-a`,
    kind: "action",
    title: "Что поможет",
    condition: action.label,
    status: "info",
    eventIds: [],
    action,
    children: [],
  });
  return nodes;
}

/**
 * Дерево последствий формируется из данных сценария:
 * ветвь «условия без изменений», по ветви на каждое включённое событие и ветви наборов событий.
 */
export function buildTree(model: ModelInput, rootTitle?: string): TreeNode {
  const plan = buildDecisionPlan(model);
  const enabled = model.events.filter((e) => e.enabled);
  const branches: { id: string; title: string; condition: string; events: StressEvent[] }[] = [
    { id: "base", title: "Всё по плану", condition: "Доходы и расходы как вы ввели", events: [] },
    ...enabled.map((e) => ({ id: `ev-${e.id}`, title: EVENT_META[e.type].label, condition: describeEvent(e), events: [e] })),
  ];
  const adverse = eventsForMode(model.events, "adverse");
  if (adverse.length > 1) branches.push({ id: "adverse", title: "Трудный сценарий", condition: `Сразу несколько событий: ${adverse.length}`, events: adverse });
  if (enabled.length > 1 && enabled.length !== adverse.length)
    branches.push({ id: "stress", title: "Кризисный сценарий", condition: `Все события сразу: ${enabled.length}`, events: enabled });

  const children = branches.map<TreeNode>((b) => {
    const metrics = simulateWith(model, b.events, plan).metrics;
    return {
      id: b.id,
      kind: "branch",
      title: b.title,
      condition: b.condition,
      metrics,
      status: metrics.status,
      month: metrics.firstReserveBreachMonth,
      eventIds: b.events.map((e) => e.id),
      children: outcomeNodes(b.id, model, b.events, metrics),
    };
  });

  const base = children[0].metrics!;
  return {
    id: "root",
    kind: "root",
    title: rootTitle || KIND_META[model.kind].label,
    condition: plan.considered[0],
    metrics: base,
    status: base.status,
    eventIds: [],
    children,
  };
}
