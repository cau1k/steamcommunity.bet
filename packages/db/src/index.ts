import { env } from "@steamcommunity.bet/env/server";
import { drizzle } from "drizzle-orm/d1";

import * as schema from "./schema";

export function createDb() {
  return drizzle(env.DB, { schema });
}
