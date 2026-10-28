"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FolderOpen, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import { ThemeMenu } from "@/components/theme-menu";
import { InstallButton } from "@/components/pwa";
import { cn } from "@/lib/utils";

export function SiteHeader() {
  const path = usePathname();
  const links = [
    { href: "/scenarios", label: "Мои сценарии", icon: FolderOpen },
    { href: "/demo", label: "Демо", icon: null },
  ];
  return (
    <header className="sticky top-0 z-40 border-b bg-bg/80 backdrop-blur-xl print:hidden">
      <div className="container flex h-16 items-center gap-2">
        <Link href="/" className="mr-auto flex items-center gap-2 rounded-lg" aria-label="FUTUREWISE — на главную">
          <Logo />
        </Link>
        <nav className="flex items-center gap-1" aria-label="Основная навигация">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-label={l.label}
              className={cn(
                "flex items-center gap-2 whitespace-nowrap rounded-lg px-2.5 py-2 text-sm font-medium text-muted transition hover:bg-surface-2 hover:text-fg sm:px-3",
                path?.startsWith(l.href) && "text-fg",
                l.href === "/demo" && "hidden sm:inline-flex",
              )}
            >
              {l.icon && <l.icon className="size-4 sm:hidden" />}
              <span className={cn(l.icon && "hidden sm:inline")}>{l.label}</span>
            </Link>
          ))}
          <Button asChild size="sm" className="ml-1">
            <Link href="/new">
              <Plus /> <span className="hidden sm:inline">Новый сценарий</span>
              <span className="sm:hidden">Новый</span>
            </Link>
          </Button>
          <InstallButton />
          <ThemeMenu />
        </nav>
      </div>
    </header>
  );
}
