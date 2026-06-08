import { z } from "zod";

const leetifyProfileSchema = z
  .object({
    steam64Id: z.string().optional(),
    name: z.string().optional(),
    leetifyUserId: z.string().nullable().optional(),
    isLeetifyUser: z.boolean().optional(),
    rating: z.number().nullable().optional(),
  })
  .passthrough();

const leetifyMatchesSchema = z.array(z.object({ id: z.string().optional() }).passthrough());

export type LeetifyClientConfig = {
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
};

export type LeetifyProfile = z.infer<typeof leetifyProfileSchema>;
export type LeetifyMatches = z.infer<typeof leetifyMatchesSchema>;

export function createLeetifyClient(config: LeetifyClientConfig = {}) {
  const baseUrl = config.baseUrl ?? "https://api-public.cs-prod.leetify.com";
  const fetchImpl = config.fetch ?? fetch;

  async function getJson(path: string) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs ?? 10_000);
    const headers = new Headers();
    if (config.apiKey) {
      headers.set("Authorization", `Bearer ${config.apiKey}`);
    }
    try {
      const response = await fetchImpl(new URL(path, baseUrl), {
        headers,
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`Leetify request failed: ${response.status}`);
      }
      return response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    async getProfile(steamId64: string): Promise<LeetifyProfile> {
      try {
        return leetifyProfileSchema.parse(await getJson(`/api/profile/${steamId64}`));
      } catch (error) {
        if (error instanceof Error && error.message === "Leetify request failed: 404") {
          return {
            steam64Id: steamId64,
            leetifyUserId: null,
            isLeetifyUser: false,
            rating: null,
          };
        }
        throw error;
      }
    },

    async getPlayerMatches(steamId64: string): Promise<LeetifyMatches> {
      try {
        return leetifyMatchesSchema.parse(await getJson(`/api/profile/${steamId64}/matches`));
      } catch (error) {
        if (error instanceof Error && error.message === "Leetify request failed: 404") {
          return [];
        }
        throw error;
      }
    },

    async getMatch(matchId: string) {
      return z.unknown().parse(await getJson(`/api/games/${matchId}`));
    },

    async getMatchBySource(source: string, sourceId: string) {
      return z.unknown().parse(await getJson(`/api/games/${source}/${sourceId}`));
    },
  };
}
