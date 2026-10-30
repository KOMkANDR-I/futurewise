"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Calculator, Cloud, HelpCircle, Lightbulb, Send, ShieldCheck, Sparkles, User } from "lucide-react";
import { buildAiPayload, buildAnalysis } from "@/lib/explain/context";
import { answerLocally, explainLocally } from "@/lib/explain/local";
import { useWorkspace } from "@/components/workspace/context";
import { Button } from "@/components/ui/button";
import { Badge, Card, Input, Spinner, Switch } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; content: string; source?: "ai" | "local"; note?: string };

const CONSENT_KEY = "futurewise.aiConsent";
const QUICK = ["Почему так получилось?", "Какой платёж я потяну?", "Что, если подождать?", "Насколько может упасть доход?", "Что влияет сильнее всего?", "Чего не хватает в данных?"];

function Section({ icon, title, items, tone }: { icon: React.ReactNode; title: string; items: string[]; tone?: string }) {
  if (!items.length) return null;
  return (
    <div>
      <h3 className={cn("flex items-center gap-2 text-sm font-semibold", tone)}>
        {icon} {title}
      </h3>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </div>
  );
}

export default function AssistantPage() {
  const { model, result } = useWorkspace();
  const analysis = useMemo(() => buildAnalysis(model, result), [model, result]);
  const ex = useMemo(() => explainLocally(analysis), [analysis]);
  const payload = useMemo(() => buildAiPayload(analysis), [analysis]);

  const [api, setApi] = useState<{ configured: boolean; model: string | null } | null>(null);
  const [consent, setConsent] = useState(false);
  const [aiText, setAiText] = useState<{ text: string; model?: string } | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      setConsent(localStorage.getItem(CONSENT_KEY) === "1");
    } catch {}
    fetch("/api/explain")
      .then((r) => r.json())
      .then((d) => setApi({ configured: !!d.configured, model: d.model ?? null }))
      .catch(() => setApi({ configured: false, model: null }));
  }, []);
  // Пересчёт сценария делает прежний AI-ответ неактуальным.
  useEffect(() => {
    setAiText(null);
  }, [payload]);
  useEffect(() => {
    if (msgs.length) endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [msgs]);

  const setConsentPersist = (v: boolean) => {
    setConsent(v);
    try {
      localStorage.setItem(CONSENT_KEY, v ? "1" : "0");
    } catch {}
  };
  const aiOn = consent && !!api?.configured;

  async function callApi(question?: string, history: Msg[] = []) {
    const res = await fetch("/api/explain", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ payload, question, history: history.slice(-8).map(({ role, content }) => ({ role, content })) }),
    });
    const d = await res.json();
    if (d.source === "ai") return { text: d.text as string, model: d.model as string };
    throw new Error(d.reason || d.error || "помощник недоступен");
  }

  const explainAi = async () => {
    setLoading(true);
    setAiError(null);
    try {
      setAiText(await callApi());
    } catch (e) {
      setAiError(`Не получилось: ${e instanceof Error ? e.message : "ошибка"}. Показываем объяснение, собранное без модели.`);
    } finally {
      setLoading(false);
    }
  };

  const ask = async (question: string) => {
    const text = question.trim();
    if (!text || loading) return;
    const history = msgs;
    setMsgs((m) => [...m, { role: "user", content: text }]);
    setQ("");
    if (!aiOn) {
      setMsgs((m) => [...m, { role: "assistant", content: answerLocally(text, analysis), source: "local" }]);
      return;
    }
    setLoading(true);
    try {
      const r = await callApi(text, history);
      setMsgs((m) => [...m, { role: "assistant", content: r.text, source: "ai" }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: "assistant", content: answerLocally(text, analysis), source: "local", note: `Модель не ответила (${e instanceof Error ? e.message : "ошибка"}), поэтому ответили сами — по расчётам.` }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="flex flex-wrap items-start gap-4">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-violet/10 text-violet">
            <Bot className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-xl font-bold">Помощник</h2>
          </div>
          <Badge tone={api?.configured ? "good" : "neutral"}>{api == null ? "проверяем…" : api.configured ? `модель · ${api.model}` : "без модели"}</Badge>
        </div>
        <label className="mt-5 flex items-start gap-3 rounded-xl border bg-surface-2/40 p-4 text-sm">
          <Switch checked={consent} onCheckedChange={setConsentPersist} disabled={!api?.configured} className="mt-0.5" />
          <span>
            <span className="font-medium">Отправлять цифры модели</span>
            <span className="mt-1 block text-xs text-muted">
              Без названия сценария.
              {!api?.configured && " Нужен AI_API_KEY на сервере."}
            </span>
          </span>
        </label>
      </Card>

      <Card className="space-y-5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 font-display text-lg font-bold">
            <Calculator className="size-4 text-accent" /> Разбор
          </h3>
          <Badge tone="accent">без модели</Badge>
        </div>
        <p className="text-sm font-medium">{ex.summary}</p>
        <p className="text-sm text-muted">{ex.mainRisk}</p>
        <div className="grid gap-5 md:grid-cols-2">
          <Section icon={<Sparkles className="size-4 text-accent" />} title="Что важно" items={ex.factors} />
          <Section icon={<Lightbulb className="size-4 text-warn" />} title="Где ваш предел" items={ex.breakpoint} />
          <Section icon={<Lightbulb className="size-4 text-good" />} title="Что можно попробовать" items={ex.suggestions} />
          <Section icon={<HelpCircle className="size-4 text-muted" />} title="Чего мы не знаем" items={ex.missing} />
        </div>
        <div className="grid gap-5 border-t pt-5 md:grid-cols-2">
          <Section icon={<Calculator className="size-4" />} title="Факты из расчёта" items={ex.facts} />
          <Section icon={<HelpCircle className="size-4" />} title="Что мы предположили" items={ex.assumptions} />
        </div>
      </Card>

      {aiOn && (
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 font-display text-lg font-bold">
              <Cloud className="size-4 text-violet" /> Что скажет языковая модель
            </h3>
            <Button size="sm" onClick={explainAi} disabled={loading}>
              {loading ? <Spinner /> : <Sparkles />} {aiText ? "Спросить заново" : "Получить объяснение"}
            </Button>
          </div>
          {aiError && <p className="mt-3 text-sm text-warn">{aiError}</p>}
          {aiText && (
            <div className="mt-4 whitespace-pre-wrap text-sm leading-relaxed">
              {aiText.text}
              <p className="mt-3 text-xs text-muted">{aiText.model}. При расхождении верьте графикам.</p>
            </div>
          )}
        </Card>
      )}

      <Card className="p-5">
        <h3 className="font-display text-lg font-bold">Спросите о своей ситуации</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {QUICK.map((x) => (
            <button key={x} type="button" onClick={() => ask(x)} className="rounded-full border px-3 py-1 text-xs text-muted transition hover:border-accent/60 hover:text-fg">
              {x}
            </button>
          ))}
        </div>
        <div className="mt-4 max-h-[460px] space-y-3 overflow-y-auto" aria-live="polite">
          {msgs.length === 0 && <p className="py-6 text-center text-sm text-muted">Задайте вопрос</p>}
          {msgs.map((m, i) => (
            <div key={i} className={cn("flex gap-3", m.role === "user" && "flex-row-reverse")}>
              <div className={cn("grid size-8 shrink-0 place-items-center rounded-full", m.role === "user" ? "bg-accent text-accent-fg" : "bg-surface-2 text-violet")}>
                {m.role === "user" ? <User className="size-4" /> : <Bot className="size-4" />}
              </div>
              <div className={cn("max-w-[85%] rounded-2xl px-4 py-3 text-sm", m.role === "user" ? "bg-accent/10" : "bg-surface-2/60")}>
                <div className="whitespace-pre-wrap">{m.content}</div>
                {m.source && <div className="mt-2 text-[11px] text-muted">{m.source === "ai" ? "ответила языковая модель" : "ответ по расчётам"}</div>}
                {m.note && <div className="mt-1 text-[11px] text-warn">{m.note}</div>}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted">
              <Spinner /> Думаем…
            </div>
          )}
          <div ref={endRef} />
        </div>
        <form
          className="mt-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            ask(q);
          }}
        >
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Например: что будет, если доход упадёт на 30%?" aria-label="Вопрос" maxLength={500} />
          <Button type="submit" disabled={!q.trim() || loading} aria-label="Отправить вопрос">
            <Send />
          </Button>
        </form>
      </Card>

      <details className="card p-5 text-sm">
        <summary className="flex cursor-pointer items-center gap-2 font-medium">
          <ShieldCheck className="size-4 text-good" /> Что именно отправляется модели
        </summary>
        <p className="mt-3 text-xs text-muted">Уходит модели только с вашего разрешения.</p>
        <pre className="mt-3 max-h-80 overflow-auto rounded-xl bg-surface-2/60 p-3 text-[11px] leading-relaxed">{JSON.stringify(payload, null, 2)}</pre>
      </details>
    </div>
  );
}
