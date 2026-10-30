// Сборка в обычные файлы (папка out): node scripts/build-static.mjs
import { spawnSync } from "node:child_process";

const r = spawnSync("npx next build", { stdio: "inherit", shell: true, env: { ...process.env, STATIC_EXPORT: "1", NEXT_TELEMETRY_DISABLED: "1" } });
process.exit(r.status ?? 1);
