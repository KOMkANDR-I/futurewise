"use client";

import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** Регистрирует service worker (только в продакшен-сборке, чтобы не мешать разработке). */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !("MSStream" in window);
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

/** Кнопка «Установить»: на Android и в Chrome — системное окно, на iPhone — подсказка. */
export function InstallButton() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [hint, setHint] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    setIos(isIos());
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setPrompt(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!prompt && !ios) return null;
  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        aria-label="Установить приложение"
        title="Установить приложение"
        onClick={async () => {
          if (prompt) {
            await prompt.prompt();
            await prompt.userChoice.catch(() => undefined);
            setPrompt(null);
          } else setHint((v) => !v);
        }}
      >
        <Download />
      </Button>
      {hint && (
        <div className="card absolute right-0 top-11 z-50 w-64 animate-fade-up p-4 text-sm">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold">Установить на iPhone</p>
            <button type="button" onClick={() => setHint(false)} className="text-muted hover:text-fg" aria-label="Закрыть">
              <X className="size-4" />
            </button>
          </div>
          <p className="mt-2 text-muted">
            Нажмите <Share className="inline size-4 align-text-bottom" /> «Поделиться» внизу Safari, затем «На экран „Домой“».
          </p>
        </div>
      )}
    </div>
  );
}
