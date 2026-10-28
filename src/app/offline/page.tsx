import Link from "next/link";
import { WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Нет интернета — FUTUREWISE" };

export default function OfflinePage() {
  return (
    <div className="container grid place-items-center py-24 text-center">
      <div className="grid size-12 place-items-center rounded-2xl bg-accent/10 text-accent">
        <WifiOff className="size-6" />
      </div>
      <h1 className="mt-4 font-display text-3xl font-extrabold">Нет интернета</h1>
      <p className="mt-2 max-w-md text-muted">Открытые раньше страницы и сценарии работают без сети.</p>
      <Button asChild className="mt-6">
        <Link href="/scenarios">Мои сценарии</Link>
      </Button>
    </div>
  );
}
