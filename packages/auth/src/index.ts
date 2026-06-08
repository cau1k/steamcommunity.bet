import { createDb } from "@steamcommunity.bet/db";
import * as schema from "@steamcommunity.bet/db/schema/auth";
import { env } from "@steamcommunity.bet/env/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, oAuthProxy } from "better-auth/plugins";
import { steamOpenId } from "./steam-plugin";

const localTrustedOrigins = ["http://localhost:5173", "http://127.0.0.1:5173"];
const productionAuthURL = "https://api.steamcommunity.bet";

export function createAuth() {
  const db = createDb();
  const trustedOrigins = Array.from(
    new Set(
      [...env.CORS_ORIGIN.split(","), ...localTrustedOrigins]
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
  );

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "sqlite",

      schema: schema,
    }),
    trustedOrigins,
    emailAndPassword: {
      enabled: false,
    },
    plugins: [
      steamOpenId(),
      admin(),
      // Better Auth OAuth proxy for local/preview OAuth providers.
      // @see https://better-auth.com/docs/plugins/oauth-proxy
      oAuthProxy({
        productionURL: productionAuthURL,
        secret: env.OAUTH_PROXY_SECRET || env.BETTER_AUTH_SECRET,
      }),
    ],
    // uncomment cookieCache setting when ready to deploy to Cloudflare using *.workers.dev domains
    // session: {
    //   cookieCache: {
    //     enabled: true,
    //     maxAge: 60,
    //   },
    // },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    advanced: {
      defaultCookieAttributes: {
        sameSite: "none",
        secure: true,
        httpOnly: true,
      },
      // uncomment crossSubDomainCookies setting when ready to deploy and replace <your-workers-subdomain> with your actual workers subdomain
      // https://developers.cloudflare.com/workers/wrangler/configuration/#workersdev
      // crossSubDomainCookies: {
      //   enabled: true,
      //   domain: "<your-workers-subdomain>",
      // },
    },
  });
}
