import { env } from "@steamcommunity.bet/env/server";
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { z } from "zod";

const STEAM_OPENID_URL = "https://steamcommunity.com/openid/login";
const OPENID_NS = "http://specs.openid.net/auth/2.0";
const OPENID_IDENTIFIER_SELECT = `${OPENID_NS}/identifier_select`;
const STEAM_CLAIMED_ID_RE = /^https?:\/\/steamcommunity\.com\/openid\/id\/(?<steamId64>\d{17})$/;
const STATE_TTL_MS = 10 * 60 * 1000;
const ADMIN_STEAM_ID = "76561199570438277";

type SteamProfile = {
  steamId64: string;
  personaName: string | null;
  profileUrl: string | null;
  avatarUrl: string | null;
};

type SteamStatePayload = {
  callbackURL: string;
  exp: number;
  nonce: string;
};

const steamSummarySchema = z.object({
  response: z.object({
    players: z.array(
      z.object({
        steamid: z.string(),
        personaname: z.string().optional(),
        profileurl: z.string().optional(),
        avatarfull: z.string().optional(),
      }),
    ),
  }),
});

const steamStartQuerySchema = z.object({
  callbackURL: z.string().optional(),
});

export function authBaseURL(baseURL: string, basePath = "/api/auth") {
  const normalizedBaseURL = baseURL.replace(/\/$/, "");
  const normalizedBasePath = basePath.startsWith("/") ? basePath : `/${basePath}`;
  const parsed = new URL(normalizedBaseURL);
  if (
    parsed.pathname === normalizedBasePath ||
    parsed.pathname.endsWith(`${normalizedBasePath}/`)
  ) {
    return normalizedBaseURL;
  }
  return `${normalizedBaseURL}${normalizedBasePath}`;
}

export function appOriginForRequest(request: Request) {
  const requestUrl = new URL(request.url);
  const referer = request.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).origin;
    } catch {
      // Ignore malformed referer. Navigation still has a deterministic origin below.
    }
  }
  if (requestUrl.hostname.startsWith("api.")) {
    requestUrl.hostname = requestUrl.hostname.replace(/^api\./, "");
  }
  return requestUrl.origin;
}

export function normalizeCallbackURL(input: string | undefined, appOrigin: string) {
  const raw = input || "/dashboard";
  let url: URL;
  try {
    url = raw.startsWith("/") ? new URL(raw, appOrigin) : new URL(raw);
  } catch {
    return new URL("/dashboard", appOrigin).toString();
  }
  if (!isAllowedCallbackURL(url, appOrigin)) {
    return new URL("/dashboard", appOrigin).toString();
  }
  return url.toString();
}

export function extractSteamId64(claimedId: string | null) {
  return claimedId?.match(STEAM_CLAIMED_ID_RE)?.groups?.steamId64 ?? null;
}

async function signState(payload: SteamStatePayload, secret: string) {
  const encoded = base64urlEncode(JSON.stringify(payload));
  const signature = await hmac(encoded, secret);
  return `${encoded}.${signature}`;
}

async function verifyState(state: string | null, secret: string) {
  if (!state) {
    throw APIError.fromStatus("BAD_REQUEST", { message: "Missing Steam auth state" });
  }
  const [encoded, signature] = state.split(".");
  if (!encoded || !signature || (await hmac(encoded, secret)) !== signature) {
    throw APIError.fromStatus("UNAUTHORIZED", { message: "Invalid Steam auth state" });
  }
  const payload = JSON.parse(base64urlDecode(encoded)) as SteamStatePayload;
  if (!payload.callbackURL || payload.exp < Date.now()) {
    throw APIError.fromStatus("UNAUTHORIZED", { message: "Expired Steam auth state" });
  }
  return payload;
}

function isAllowedCallbackURL(url: URL, appOrigin: string) {
  if (url.origin === appOrigin) {
    return true;
  }
  if (url.hostname === "steamcommunity.bet" || url.hostname.endsWith(".steamcommunity.bet")) {
    return true;
  }
  if (["localhost", "127.0.0.1"].includes(url.hostname)) {
    return true;
  }
  return url.hostname.endsWith(".workers.dev");
}

function base64urlEncode(value: string) {
  return btoa(value).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64urlDecode(value: string) {
  const padded = value
    .replaceAll("-", "+")
    .replaceAll("_", "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  return atob(padded);
}

async function hmac(data: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return base64urlEncode(String.fromCharCode(...new Uint8Array(signature)));
}

async function verifySteamOpenId(searchParams: URLSearchParams) {
  if (searchParams.get("openid.mode") !== "id_res") {
    throw APIError.fromStatus("UNAUTHORIZED", { message: "Steam sign in was cancelled" });
  }
  if (searchParams.get("openid.op_endpoint") !== STEAM_OPENID_URL) {
    throw APIError.fromStatus("UNAUTHORIZED", { message: "Invalid Steam OpenID endpoint" });
  }

  const verificationParams = new URLSearchParams(searchParams);
  verificationParams.set("openid.mode", "check_authentication");
  const response = await fetch(STEAM_OPENID_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: verificationParams,
  });
  if (!response.ok) {
    throw APIError.fromStatus("UNAUTHORIZED", { message: "Steam OpenID verification failed" });
  }
  const body = await response.text();
  if (!body.includes("is_valid:true")) {
    throw APIError.fromStatus("UNAUTHORIZED", { message: "Steam OpenID signature rejected" });
  }
}

async function fetchSteamProfile(steamId64: string): Promise<SteamProfile> {
  const url = new URL("/ISteamUser/GetPlayerSummaries/v0002/", "https://api.steampowered.com");
  url.searchParams.set("key", env.STEAM_API_KEY);
  url.searchParams.set("steamids", steamId64);
  const response = await fetch(url);
  if (!response.ok) {
    return { steamId64, personaName: null, profileUrl: null, avatarUrl: null };
  }
  const payload = steamSummarySchema.safeParse(await response.json());
  const player = payload.success ? payload.data.response.players[0] : null;
  return {
    steamId64,
    personaName: player?.personaname ?? null,
    profileUrl: player?.profileurl ?? `https://steamcommunity.com/profiles/${steamId64}`,
    avatarUrl: player?.avatarfull ?? null,
  };
}

export function steamOpenId(): BetterAuthPlugin {
  return {
    id: "steam-openid",
    endpoints: {
      signInSteam: createAuthEndpoint(
        "/steam",
        {
          method: "GET",
          query: steamStartQuerySchema,
          requireRequest: true,
        },
        async (ctx) => {
          const baseURL = authBaseURL(ctx.context.baseURL, ctx.context.options.basePath);
          const callbackURL = normalizeCallbackURL(
            ctx.query.callbackURL,
            appOriginForRequest(ctx.request),
          );
          const returnTo = new URL(`${baseURL}/steam/callback`);
          returnTo.searchParams.set(
            "state",
            await signState(
              {
                callbackURL,
                exp: Date.now() + STATE_TTL_MS,
                nonce: crypto.randomUUID(),
              },
              ctx.context.secret,
            ),
          );

          const steamUrl = new URL(STEAM_OPENID_URL);
          steamUrl.searchParams.set("openid.ns", OPENID_NS);
          steamUrl.searchParams.set("openid.mode", "checkid_setup");
          steamUrl.searchParams.set("openid.return_to", returnTo.toString());
          steamUrl.searchParams.set("openid.realm", new URL(baseURL).origin);
          steamUrl.searchParams.set("openid.identity", OPENID_IDENTIFIER_SELECT);
          steamUrl.searchParams.set("openid.claimed_id", OPENID_IDENTIFIER_SELECT);
          throw ctx.redirect(steamUrl.toString());
        },
      ),
      steamCallback: createAuthEndpoint(
        "/steam/callback",
        {
          method: "GET",
          requireRequest: true,
        },
        async (ctx) => {
          const requestUrl = new URL(ctx.request.url);
          const state = await verifyState(requestUrl.searchParams.get("state"), ctx.context.secret);
          await verifySteamOpenId(requestUrl.searchParams);

          const steamId64 = extractSteamId64(requestUrl.searchParams.get("openid.claimed_id"));
          if (!steamId64) {
            throw APIError.fromStatus("UNAUTHORIZED", {
              message: "SteamID was missing from OpenID response",
            });
          }

          const profile = await fetchSteamProfile(steamId64);
          const email = `${steamId64}@steamcommunity.bet`;
          const existingAccount = await ctx.context.internalAdapter.findAccountByProviderId(
            steamId64,
            "steam",
          );
          let user = existingAccount
            ? await ctx.context.internalAdapter.findUserById(existingAccount.userId)
            : null;

          if (!user) {
            const existingUser = await ctx.context.internalAdapter.findUserByEmail(email);
            user =
              existingUser?.user ??
              (await ctx.context.internalAdapter.createUser({
                email,
                emailVerified: true,
                image: profile.avatarUrl ?? "",
                name: profile.personaName ?? steamId64,
              }));
            await ctx.context.internalAdapter.linkAccount({
              userId: user.id,
              providerId: "steam",
              accountId: steamId64,
            });
          } else if (
            (profile.personaName && profile.personaName !== user.name) ||
            (profile.avatarUrl && profile.avatarUrl !== user.image)
          ) {
            user = await ctx.context.internalAdapter.updateUser(user.id, {
              image: profile.avatarUrl ?? user.image,
              name: profile.personaName ?? user.name,
            });
          }
          if (steamId64 === ADMIN_STEAM_ID) {
            user = await ctx.context.internalAdapter.updateUser(user.id, {
              role: "admin",
            });
          }

          const session = await ctx.context.internalAdapter.createSession(user.id);
          if (!session) {
            throw APIError.fromStatus("INTERNAL_SERVER_ERROR", {
              message: "Failed to create Steam session",
            });
          }
          await setSessionCookie(ctx, { session, user });
          throw ctx.redirect(state.callbackURL);
        },
      ),
    },
  };
}
