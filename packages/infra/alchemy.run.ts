import { URL, fileURLToPath } from "node:url";

import alchemy from "alchemy";
import { DnsRecords } from "alchemy/cloudflare";
import { Route } from "alchemy/cloudflare";
import { SvelteKit } from "alchemy/cloudflare";
import { Worker } from "alchemy/cloudflare";
import { D1Database } from "alchemy/cloudflare";
import { config } from "dotenv";

config({ path: "./.env" });
config({ path: "../../apps/web/.env" });
config({ path: "../../apps/server/.env" });

const app = await alchemy("steamcommunity.bet");
const isDev = process.argv.includes("--dev");
if (isDev) {
  process.env.STEAMCOMMUNITY_BET_WEB_DEV = "1";
}
const dbMigrationsDir = fileURLToPath(new URL("../../packages/db/src/migrations", import.meta.url));
const deployedWebOrigin = "https://steamcommunity-bet-web-user.caulk.workers.dev";
const apexOrigin = "https://steamcommunity.bet";
const apiOrigin = "https://api.steamcommunity.bet";
const zoneId = "6d49123f74e53ae15f6a3e983239c0f6";

if (isDev) {
  process.env.PUBLIC_SERVER_URL = apiOrigin;
}

const db = await D1Database("database", {
  migrationsDir: dbMigrationsDir,
  migrationsTable: "d1_migrations",
});

export const server = await Worker("server", {
  cwd: "../../apps/server",
  entrypoint: "src/index.ts",
  compatibility: "node",
  url: true,
  bindings: {
    DB: db,
    CORS_ORIGIN: `${alchemy.env.CORS_ORIGIN!},${deployedWebOrigin},${apexOrigin},${apiOrigin}`,
    BETTER_AUTH_SECRET: alchemy.secret.env.BETTER_AUTH_SECRET!,
    BETTER_AUTH_URL: apiOrigin,
    STEAM_API_KEY: alchemy.secret.env.STEAM_API_KEY!,
    FACEIT_API_KEY: alchemy.secret.env.FACEIT_API_KEY!,
    FACEIT_BASE_URL: process.env.FACEIT_BASE_URL ?? "https://open.faceit.com/data/v4",
    FACEIT_TIMEOUT_MS: process.env.FACEIT_TIMEOUT_MS ?? "10000",
    LEETIFY_API_KEY: alchemy.secret.env.LEETIFY_API_KEY!,
    LEETIFY_BASE_URL: process.env.LEETIFY_BASE_URL ?? "https://api.cs-prod.leetify.com",
    LEETIFY_TIMEOUT_MS: process.env.LEETIFY_TIMEOUT_MS ?? "10000",
    CSSTATS_BASE_URL: process.env.CSSTATS_BASE_URL ?? "https://csgostats.gg",
    CSSTATS_TIMEOUT_MS: process.env.CSSTATS_TIMEOUT_MS ?? "10000",
    CSSTATS_USER_AGENT: process.env.CSSTATS_USER_AGENT ?? "steamcommunity.bet/0.1",
    PROVIDER_CACHE_STALE_HOURS: process.env.PROVIDER_CACHE_STALE_HOURS ?? "12",
    PROVIDER_CACHE_ERROR_TTL_MINUTES: process.env.PROVIDER_CACHE_ERROR_TTL_MINUTES ?? "15",
    REPORT_STALE_HOURS: process.env.REPORT_STALE_HOURS ?? "12",
  },
  dev: {
    url: apiOrigin,
  },
});

export const web = await SvelteKit("web", {
  cwd: "../../apps/web",
  bindings: {
    PUBLIC_SERVER_URL: apiOrigin,
  },
  dev: {
    domain: "localhost:5173",
  },
});

export const dns = await DnsRecords("apex-dns", {
  zoneId,
  records: [
    {
      name: "steamcommunity.bet",
      type: "A",
      content: "192.0.2.1",
      proxied: true,
      ttl: 1,
    },
    {
      name: "api.steamcommunity.bet",
      type: "A",
      content: "192.0.2.1",
      proxied: true,
      ttl: 1,
    },
  ],
});

export const webRoute = await Route("apex-web-route", {
  zoneId,
  pattern: "steamcommunity.bet/*",
  script: web,
  dev: isDev,
});

export const apiRoute = await Route("api-web-route", {
  zoneId,
  pattern: "api.steamcommunity.bet/*",
  script: server,
  dev: isDev,
});

console.log(`Web    -> ${web.url}`);
console.log(`Domain -> ${apexOrigin}`);
console.log(`Server -> ${server.url}`);
console.log(`API    -> ${apiOrigin}`);

await app.finalize();
