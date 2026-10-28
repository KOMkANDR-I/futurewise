"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { GitBranch, MousePointerClick, Play } from "lucide-react";
import { buildTree, simulateWith, STATUS_META, type Metrics, type ModelInput, type Status, type TreeNode } from "@/lib/engine";
import { useWorkspace } from "@/components/workspace/context";
import { EventCard } from "@/components/events-editor";
import { Button } from "@/components/ui/button";
import { Badge, Card, statusTone } from "@/components/ui/primitives";
import { formatRub, fromMonth, inMonth } from "@/lib/format";
import { cn } from "@/lib/utils";

const W = 250;
const H = 64;
const ROW = 80;
const COLS = [12, 312, 612];

const statusColor = (s: Status | "info") => (s === "ok" ? "rgb(var(--good))" : s === "reserve" ? "rgb(var(--warn))" : s === "deficit" ? "rgb(var(--bad))" : "rgb(var(--violet))");

interface Placed {
  node: TreeNode;
  x: number;
  y: number;
  parent?: Placed;
}

function layout(root: TreeNode): Placed[] {
  const placed: Placed[] = [];
  let row = 0;
  const rootP: Placed = { node: root, x: COLS[0], y: 0 };
  const branches: Placed[] = [];
  for (const b of root.children) {
    const kids: Placed[] = b.children.map((c) => ({ node: c, x: COLS[2], y: 16 + row++ * ROW }));
    const bp: Placed = { node: b, x: COLS[1], y: kids.length ? (kids[0].y + kids[kids.length - 1].y) / 2 : 16 + row++ * ROW, parent: rootP };
    kids.forEach((k) => (k.parent = bp));
    branches.push(bp);
    placed.push(bp, ...kids);
    row += 0.25;
  }
  rootP.y = branches.length ? (branches[0].y + branches[branches.length - 1].y) / 2 : 16;
  return [rootP, ...placed];
}

const trunc = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function MetricsList({ m, reserve }: { m: Metrics; reserve: number }) {
  return (
    <dl className="grid grid-cols-2 gap-3 text-sm">
      <div>
        <dt className="text-xs text-muted">Меньше всего денег</dt>
        <dd className="num font-semibold">
          {formatRub(m.minBalance)} <span className="text-xs font-normal text-muted">{inMonth(m.minMonth)}</span>
        </dd>
      </div>
      <div>
        <dt className="text-xs text-muted">В конце расчёта</dt>
        <dd className="num font-semibold">{formatRub(m.endBalance)}</dd>
      </div>
      <div>
        <dt className="text-xs text-muted">Когда станет туго</dt>
        <dd className="num font-semibold">{m.firstDeficitMonth ? `денег не хватит ${fromMonth(m.firstDeficitMonth)}` : m.firstReserveBreachMonth ? `запас тронут ${fromMonth(m.firstReserveBreachMonth)}` : "всё в порядке"}</dd>
      </div>
      <div>
        <dt className="text-xs text-muted">По сравнению с запасом ({formatRub(reserve)})</dt>
        <dd className={cn("num font-semibold", m.minBalance >= reserve ? "text-good" : "text-warn")}>
          {m.minBalance >= reserve ? `+${formatRub(m.minBalance - reserve)}` : `−${formatRub(reserve - m.minBalance)}`}
        </dd>
      </div>
    </dl>
  );
}

export default function TreePage() {
  const { model, setModel, scenario } = useWorkspace();
  const tree = useMemo(() => buildTree(model, scenario.title), [model, scenario.title]);
  const placed = useMemo(() => layout(tree), [tree]);
  const [selectedId, setSelectedId] = useState<string>("root");
  const [checked, setChecked] = useState<{ id: string; m: Metrics } | null>(null);
  const sel = placed.find((p) => p.node.id === selectedId) ?? placed[0];
  const height = Math.max(...placed.map((p) => p.y)) + H + 20;
  const reserve = model.finances.minReserve;

  // Ветвь, к которой относится выбранный узел (для действий и редактирования событий).
  const branch = sel.node.kind === "branch" ? sel.node : sel.parent?.node.kind === "branch" ? sel.parent.node : null;
  const branchEvents = branch ? model.events.filter((e) => branch.eventIds.includes(e.id)) : [];

  const applyAction = (m: ModelInput, node: TreeNode): ModelInput => {
    const next = structuredClone(m);
    const a = node.action?.apply;
    if (a?.type === "deferTo") next.decision.startMonth = a.month;
    if (a?.type === "addSavings") next.finances.savings += a.amount;
    return next;
  };

  const check = () => {
    if (!branch) return;
    const alt = applyAction(model, sel.node);
    const evs = alt.events.filter((e) => branch.eventIds.includes(e.id));
    setChecked({ id: sel.node.id, m: simulateWith(alt, evs).metrics });
  };

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-violet/10 text-violet">
            <GitBranch className="size-5" />
          </div>
          <div>
            <h2 className="font-display text-xl font-bold">Что будет, если…</h2>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto p-4">
          <svg viewBox={`0 0 ${COLS[2] + W + 12} ${height}`} width={COLS[2] + W + 12} height={height} className="mx-auto block" role="tree" aria-label="Дерево «что, если»">
            {placed
              .filter((p) => p.parent)
              .map((p) => {
                const x1 = p.parent!.x + W;
                const y1 = p.parent!.y + H / 2;
                const x2 = p.x;
                const y2 = p.y + H / 2;
                const mx = (x1 + x2) / 2;
                return (
                  <path
                    key={`l-${p.node.id}`}
                    d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`}
                    fill="none"
                    stroke={statusColor(p.node.status)}
                    strokeOpacity={0.45}
                    strokeWidth={2}
                    strokeDasharray={p.node.kind === "action" ? "4 4" : undefined}
                  />
                );
              })}
            {placed.map((p) => {
              const n = p.node;
              const active = n.id === sel.node.id;
              const select = () => {
                setSelectedId(n.id);
                setChecked(null);
              };
              return (
                <g
                  key={n.id}
                  transform={`translate(${p.x},${p.y})`}
                  role="treeitem"
                  aria-selected={active}
                  tabIndex={0}
                  aria-label={`${n.title}. ${n.condition ?? ""}`}
                  onClick={select}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      select();
                    }
                  }}
                  className="cursor-pointer outline-none [&:focus-visible>rect:first-child]:stroke-[rgb(var(--accent))]"
                >
                  <rect
                    width={W}
                    height={H}
                    rx={14}
                    fill={active ? "rgb(var(--surface-2))" : "rgb(var(--surface))"}
                    stroke={active ? "rgb(var(--accent))" : "rgb(var(--border))"}
                    strokeWidth={active ? 2 : 1}
                  />
                  <rect x={0} y={14} width={4} height={H - 28} rx={2} fill={statusColor(n.status)} />
                  <text x={16} y={26} fontSize={13} fontWeight={700} fill="rgb(var(--fg))">
                    {trunc(n.title, 30)}
                  </text>
                  <text x={16} y={46} fontSize={11} fill="rgb(var(--muted))">
                    {trunc(n.condition ?? "", 40)}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
        <div className="flex flex-wrap gap-3 border-t px-4 py-3 text-xs text-muted">
          {(["ok", "reserve", "deficit"] as const).map((s) => (
            <span key={s} className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full" style={{ background: statusColor(s) }} /> {STATUS_META[s].label}
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full" style={{ background: statusColor("info") }} /> что можно сделать
          </span>
          <span className="ml-auto flex items-center gap-1.5">
            <MousePointerClick className="size-3.5" /> можно выбирать с клавиатуры: Tab и Enter
          </span>
        </div>
      </Card>

      <Card className="p-5" aria-live="polite">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={statusTone(sel.node.status)}>{sel.node.kind === "root" ? "решение" : sel.node.kind === "branch" ? "если…" : sel.node.kind === "outcome" ? "то…" : "что делать"}</Badge>
          <h3 className="font-display text-lg font-bold">{sel.node.title}</h3>
        </div>
        {sel.node.condition && (
          <p className="mt-1 text-sm text-muted">
            {sel.node.condition}
          </p>
        )}

        {sel.node.metrics && (
          <div className="mt-4">
            <MetricsList m={sel.node.metrics} reserve={reserve} />
          </div>
        )}

        {sel.node.kind === "action" && sel.node.action && (
          <div className="mt-4 space-y-3">
            <p className="text-sm">{sel.node.action.detail}</p>
            {sel.node.action.apply.type !== "none" && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={check}>
                  <Play /> Проверить
                </Button>
                {sel.node.action.apply.type === "deferTo" && (
                  <Button size="sm" variant="secondary" onClick={() => setModel(applyAction(model, sel.node))}>
                    Сохранить в сценарий
                  </Button>
                )}
              </div>
            )}
            {checked?.id === sel.node.id && (
              <div className="rounded-xl border border-accent/30 bg-accent/5 p-4">
                <p className="mb-3 text-xs font-semibold text-accent">Если так сделать, в ветке «{branch?.title}» будет так:</p>
                <MetricsList m={checked.m} reserve={reserve} />
              </div>
            )}
          </div>
        )}

        {sel.node.kind === "branch" && branchEvents.length > 0 && (
          <div className="mt-5 space-y-3">
            <p className="text-sm font-medium">Условия</p>
            {branchEvents.map((e) => (
              <EventCard key={e.id} event={e} horizon={model.horizon} compact onChange={(ne) => setModel({ ...model, events: model.events.map((x) => (x.id === ne.id ? ne : x)) })} />
            ))}
          </div>
        )}
        {sel.node.kind === "root" && (
          <p className="mt-4 text-sm text-muted">
            Веток: {tree.children.length} ·{" "}
            <Link href={`/new?edit=${scenario.id}`} className="text-accent underline-offset-2 hover:underline">
              добавить событие
            </Link>
          </p>
        )}
      </Card>
    </div>
  );
}
