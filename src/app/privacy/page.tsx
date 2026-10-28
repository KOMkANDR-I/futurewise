import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Приватность — FUTUREWISE" };

export default function PrivacyPage() {
  return (
    <div className="container max-w-3xl py-12">
      <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">Приватность</h1>
      <ul className="mt-6 list-disc space-y-2 pl-5 text-sm text-muted">
        <li>Сценарии хранятся только в этом браузере. Очистите данные сайта — пропадут; сохраняйте через «Экспорт».</li>
        <li>Помощнику цифры уходят только с вашего разрешения, без названия сценария.</li>
        <li>Мы не просим доступ к банку, пароли, номера карт и паспорт.</li>
      </ul>
      <Button asChild className="mt-8">
        <Link href="/new">Создать сценарий</Link>
      </Button>
    </div>
  );
}
