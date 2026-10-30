// STATIC_EXPORT=1 — сборка в обычные файлы (папка out) для статического хостинга.
// Серверный маршрут AI (route.api.ts) в неё не входит: помощник работает локальными шаблонами.
const isStatic = process.env.STATIC_EXPORT === "1";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Отдельная папка сборки для продакшен-сервера (NEXT_DIST_DIR=.next-prod), чтобы не мешать запущенному `next dev`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  pageExtensions: isStatic ? ["tsx", "ts"] : ["tsx", "ts", "api.ts"],
  ...(isStatic
    ? { output: "export", trailingSlash: true }
    : {
        async headers() {
          return [
            {
              // Service worker всегда проверяется заново, чтобы обновления приходили сразу.
              source: "/sw.js",
              headers: [
                { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
                { key: "Service-Worker-Allowed", value: "/" },
              ],
            },
          ];
        },
      }),
};

export default nextConfig;
