import Link from "next/link";
import { Logo } from "@/components/logo";

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t print:hidden">
      <div className="container flex flex-wrap items-center justify-between gap-4 py-8 text-sm text-muted">
        <div className="flex flex-wrap items-center gap-4">
          <Logo />
          <span>Не финансовый совет и не прогноз.</span>
        </div>
        <nav className="flex flex-wrap gap-4" aria-label="Дополнительная навигация">
          <Link href="/pitch" className="hover:text-fg">
            Презентация
          </Link>
          <Link href="/privacy" className="hover:text-fg">
            Приватность
          </Link>
        </nav>
      </div>
    </footer>
  );
}
