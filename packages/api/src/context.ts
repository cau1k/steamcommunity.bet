import { createAuth } from "@steamcommunity.bet/auth";
import type { Context as HonoContext } from "hono";

export type CreateContextOptions = {
  context: HonoContext;
};

export async function createContext({ context }: CreateContextOptions) {
  const session = await createAuth().api.getSession({
    headers: context.req.raw.headers,
  });
  return {
    auth: null,
    waitUntil: (
      context as HonoContext & { executionCtx?: ExecutionContext }
    ).executionCtx?.waitUntil.bind(
      (context as HonoContext & { executionCtx?: ExecutionContext }).executionCtx,
    ),
    session,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
