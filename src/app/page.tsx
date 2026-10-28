import Link from "next/link";
import { ArrowRight, Banknote, Briefcase, CreditCard, Home, Laptop, PiggyBank, Play, Scale, Sliders, Target, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HeroTree } from "@/components/hero-tree";

const STEPS = [
  { icon: Sliders, title: "Ваши цифры" },
  { icon: Zap, title: "Неприятности" },
  { icon: Target, title: "Ваш предел" },
  { icon: Scale, title: "Варианты" },
];

const SITUATIONS = [
  { icon: Laptop, kind: "purchase", title: "Крупная покупка" },
  { icon: CreditCard, kind: "installment", title: "Рассрочка" },
  { icon: Banknote, kind: "loan", title: "Кредит" },
  { icon: Briefcase, kind: "income_change", title: "Смена работы" },
  { icon: Home, kind: "relocation", title: "Переезд" },
  { icon: PiggyBank, kind: "cushion", title: "Финансовая подушка" },
];

export default function HomePage() {
  return (
    <>
      <section className="relative overflow-hidden">
        <div className="grid-bg absolute inset-0 -z-10" aria-hidden />
        <div className="absolute -top-40 left-1/2 -z-10 h-[480px] w-[900px] -translate-x-1/2 rounded-full bg-accent/10 blur-3xl" aria-hidden />
        <div className="container grid items-center gap-10 py-14 lg:grid-cols-[1.05fr_1fr] lg:py-24">
          <div className="animate-fade-up">
            <h1 className="font-display text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">А если всё пойдёт не по плану?</h1>
            <p className="mt-5 max-w-xl text-lg text-muted">Краш-тест покупок, рассрочек и кредитов на ваших цифрах.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/new">
                  Протестировать решение <ArrowRight />
                </Link>
              </Button>
              <Button asChild size="lg" variant="secondary">
                <Link href="/demo">
                  <Play /> Демо
                </Link>
              </Button>
            </div>
          </div>
          <div className="animate-fade-up [animation-delay:120ms]">
            <HeroTree />
          </div>
        </div>
      </section>

      <section id="how" className="container scroll-mt-20 py-12">
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="card flex items-center gap-3 p-4">
              <span className="grid size-10 place-items-center rounded-xl bg-accent/10 text-accent">
                <s.icon className="size-5" />
              </span>
              <span className="font-semibold">{s.title}</span>
              <span className="ml-auto font-display text-2xl font-extrabold text-surface-2">0{i + 1}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="container py-12">
        <h2 className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">Что проверить</h2>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SITUATIONS.map((s) => (
            <Link key={s.kind} href={`/new?kind=${s.kind}`} className="card group flex items-center gap-4 p-4 transition hover:border-accent/50">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-muted transition group-hover:bg-accent group-hover:text-accent-fg">
                <s.icon className="size-5" />
              </span>
              <span className="font-semibold">{s.title}</span>
              <ArrowRight className="ml-auto size-4 opacity-0 transition group-hover:opacity-100" />
            </Link>
          ))}
        </div>
      </section>

      <section className="container py-12">
        <div className="card flex flex-wrap items-center justify-between gap-6 p-6 sm:p-8">
          <h2 className="font-display text-2xl font-extrabold tracking-tight">Демо: ноутбук за 90 000 ₽ при доходе 60 000 ₽</h2>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="lg">
              <Link href="/demo">
                Запустить <ArrowRight />
              </Link>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <Link href="/pitch">
                <Play /> Презентация
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
