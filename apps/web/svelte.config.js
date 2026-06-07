import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import adapter from "@sveltejs/adapter-auto";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import alchemy from "alchemy/cloudflare/sveltekit";
const alchemyConfigPath = fileURLToPath(
  new URL("./.alchemy/local/wrangler.jsonc", import.meta.url),
);
const shouldUseAlchemy = existsSync(alchemyConfigPath);

/** @type {import('@sveltejs/kit').Config} */
const config = {
  // Consult https://svelte.dev/docs/kit/integrations
  // for more information about preprocessors
  preprocess: vitePreprocess(),

  kit: {
    // Alchemy's adapter wraps SvelteKit's Cloudflare adapter for local platform.env and Worker builds.
    adapter: shouldUseAlchemy
      ? alchemy({ platformProxy: { configPath: alchemyConfigPath } })
      : adapter(),
  },
};

export default config;
