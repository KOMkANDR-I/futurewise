"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, CreditCard, Wallet, type LucideIcon } from "lucide-react";
import { demoModel } from "@/lib/engine";
import { createScenario } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

type Choice = "cash" | "installment" | "save";

const OPTIONS: { id: Choice; icon: LucideIcon; title: string; text: string }[] = [
  { id: "cash", icon: Wallet, title: "Сразу всей суммой", text: "Без платежей" },
  { id: "installment", icon: CreditCard, title: "В рассрочку: 10 000 ₽ × 9 месяцев", text: "Без взноса и комиссий" },
  { id: "save", icon: CalendarClock, title: "Накопить и купить позже", text: "Покупка в 4-м месяце" },
];

export default function DemoPage() {
  const router = useRouter();
  const [choice, setChoice] = useState<Choice | null>(null);
  const [busy, setBusy] = useState(false);

  const start = () => {
    if (!choice) return;
    setBusy(true);
    const label = OPTIONS.find((o) => o.id === choice)!.title;
    const s = createScenario(`Демо: ноутбук за 90 000 ₽ — ${label.toLowerCase()}`, demoModel(choice), true);
    router.push(`/scenario/${s.id}`);
  };

  return (
    <div className="container max-w-4xl py-12">
      <p className="eyebrow">Демо</p>
      <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight sm:text-5xl">Покупка ноутбука за 90 000 ₽</h1>
      <Card className="mt-6 grid gap-4 p-5 text-sm sm:grid-cols-3">
        {[
          ["Доход", "60 000 ₽ в месяц"],
          ["Расходы", "35 000 ₽ в месяц"],
          ["Накоплено", "50 000 ₽"],
          ["Запас", "20 000 ₽"],
          ["Считаем на", "12 месяцев"],
          ["Риски", "−20% дохода во 2–3-м мес., трата 15 000 ₽ в 3-м"],
        ].map(([k, v]) => (
          <div key={k}>
            <div className="text-muted">{k}</div>
            <div className="mt-0.5 font-semibold">{v}</div>
          </div>
        ))}
      </Card>

      <h2 className="mt-10 font-display text-xl font-bold">Как платите?</h2>
      <div role="radiogroup" aria-label="Способ оплаты" className="mt-5 grid gap-3 sm:grid-cols-3">
        {OPTIONS.map((o) => {
          const active = choice === o.id;
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setChoice(o.id)}
              className={cn("card flex flex-col items-start gap-3 p-5 text-left transition hover:border-accent/60", active && "border-accent ring-1 ring-accent")}
            >
              <span className={cn("grid size-10 place-items-center rounded-xl", active ? "bg-accent text-accent-fg" : "bg-surface-2 text-muted")}>
                <o.icon className="size-5" />
              </span>
              <span className="font-semibold">{o.title}</span>
              <span className="text-sm text-muted">{o.text}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-8 flex flex-wrap items-center gap-4">
        <Button size="lg" disabled={!choice || busy} onClick={start}>
          Запустить краш-тест
        </Button>
      </div>
    </div>
  );
}
