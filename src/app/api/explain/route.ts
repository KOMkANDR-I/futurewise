import { NextResponse } from "next/server";
import { z } from "zod";

/**
 * Серверный endpoint AI-объяснений. Ключ читается только из переменных окружения сервера.
 * Если ключ не задан или провайдер недоступен — возвращается source: "unavailable",
 * и клиент использует локальные шаблоны объяснений.
 */

const SYSTEM_PROMPT = `Ты — аналитический помощник FUTUREWISE, сервиса сценарного стресс-тестирования личных финансовых решений.
Тебе передан JSON с параметрами сценария и показателями, которые рассчитало детерминированное ядро.
Правила:
1. Используй только числа из JSON. Не придумывай новые суммы, проценты, ставки, вероятности или рыночные данные.
2. Не пересчитывай и не исправляй результаты ядра. Если чего-то нет в данных — прямо скажи, каких данных не хватает.
3. Не утверждай, что знаешь будущее. Это условные сценарии «что, если», а не прогноз и не гарантия.
4. Чётко различай: «расчёт показывает» (факт модели) и «предположение» (допущение или входные данные пользователя).
5. Вероятности событий упоминай, только если они заданы пользователем, и отдельно от тяжести последствий.
6. Не давай персональных инвестиционных рекомендаций, не оценивай кредитоспособность и вероятность дефолта.
7. Предлагай варианты для сравнения из списка alternatives, а не единственное «правильное» решение; называй компромиссы.
8. Пиши простым живым русским языком, как объяснял бы другу: без канцелярита и финансового жаргона. Вместо «горизонт моделирования» — «срок расчёта», вместо «нарушение резерва» — «запас тронут», вместо «дефицит» — «денег не хватит», вместо «мес. 3» — «в 3-м месяце». Сценарии называй «обычный», «трудный», «кризисный».
9. Коротко: 3–7 предложений или короткий список. Суммы — с пробелами между тысячами и знаком ₽.`;

const bodySchema = z.object({
  payload: z.record(z.unknown()),
  question: z.string().max(1000).optional(),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }))
    .max(10)
    .optional(),
});

function config() {
  const key = process.env.AI_API_KEY?.trim();
  const provider = (process.env.AI_PROVIDER || "anthropic").toLowerCase();
  const model = process.env.AI_MODEL || (provider === "anthropic" ? "claude-sonnet-5-5" : "gpt-4o-mini");
  const baseUrl = (process.env.AI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  return { key, provider, model, baseUrl, configured: Boolean(key) };
}

export async function GET() {
  const c = config();
  return NextResponse.json({ configured: c.configured, provider: c.configured ? c.provider : null, model: c.configured ? c.model : null });
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > 80_000) return NextResponse.json({ error: "Слишком большой запрос" }, { status: 413 });
  let parsed;
  try {
    parsed = bodySchema.safeParse(JSON.parse(raw));
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }
  if (!parsed.success) return NextResponse.json({ error: "Некорректный формат запроса" }, { status: 400 });

  const c = config();
  if (!c.configured) return NextResponse.json({ source: "unavailable", reason: "AI API не настроен на сервере" });

  const { payload, question, history = [] } = parsed.data;
  const userText = `Данные сценария (JSON):\n${JSON.stringify(payload)}\n\n${
    question ? `Вопрос пользователя: ${question}` : "Объясни результат: главный риск, ключевые факторы, почему возникает точка перелома, какие варианты стоит сравнить и каких данных не хватает."
  }`;
  const messages = [...history, { role: "user" as const, content: userText }];

  try {
    let text = "";
    if (c.provider === "anthropic") {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": c.key!, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: c.model, max_tokens: 900, system: SYSTEM_PROMPT, messages }),
        signal: AbortSignal.timeout(25_000),
      });
      if (!res.ok) throw new Error(`Провайдер ответил ${res.status}`);
      const data = (await res.json()) as { content?: { type: string; text?: string }[] };
      text = (data.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
    } else {
      const res = await fetch(`${c.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${c.key}` },
        body: JSON.stringify({ model: c.model, max_tokens: 900, messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages] }),
        signal: AbortSignal.timeout(25_000),
      });
      if (!res.ok) throw new Error(`Провайдер ответил ${res.status}`);
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      text = data.choices?.[0]?.message?.content ?? "";
    }
    if (!text.trim()) throw new Error("Пустой ответ модели");
    return NextResponse.json({ source: "ai", model: c.model, text });
  } catch (e) {
    return NextResponse.json({ source: "unavailable", reason: e instanceof Error ? e.message : "Ошибка запроса к AI API" });
  }
}
