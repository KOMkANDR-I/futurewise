import type { Metadata, Viewport } from "next";
import { Inter, Manrope } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { PwaRegister } from "@/components/pwa";

const sans = Inter({ subsets: ["latin", "cyrillic"], variable: "--font-sans", display: "swap" });
const display = Manrope({ subsets: ["latin", "cyrillic"], variable: "--font-display", display: "swap" });

export const metadata: Metadata = {
  title: "FUTUREWISE — краш-тест финансовых решений",
  description: "Проверьте решение заранее: краш-тест покупок, рассрочек и кредитов на ваших цифрах.",
  applicationName: "FUTUREWISE",
  appleWebApp: { capable: true, title: "FUTUREWISE", statusBarStyle: "black-translucent" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#090d18" },
    { media: "(prefers-color-scheme: light)", color: "#f6f8fc" },
  ],
};

// Тема применяется до отрисовки, чтобы не было мигания.
// futurewise.theme: "light" | "dark"; нет значения — как в системе.
const themeScript = `(function(){var d=document.documentElement,t=null;try{t=localStorage.getItem('futurewise.theme')}catch(e){}var dark=t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(dark)d.classList.add('dark')})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning className={`${sans.variable} ${display.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen font-sans">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-accent focus:px-3 focus:py-2 focus:text-accent-fg">
          К содержанию
        </a>
        <div className="flex min-h-screen flex-col">
          <SiteHeader />
          <main id="main" className="flex-1">
            {children}
          </main>
          <SiteFooter />
        </div>
        <PwaRegister />
      </body>
    </html>
  );
}
