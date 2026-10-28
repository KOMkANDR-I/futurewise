/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Отдельная папка сборки для продакшен-сервера (NEXT_DIST_DIR=.next-prod), чтобы не мешать запущенному `next dev`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
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
};

export default nextConfig;
