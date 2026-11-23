import { getSessionUser, readSessionCookie } from "./auth";
import { getStore, type Store } from "./db";
import type { User } from "./db/types";
import { bearerToken, getDesktopSession } from "./desktop-auth";
import { sameOrigin } from "./http";

export async function accountFromRequest(req: Request): Promise<{ user: User; store: Store } | { blocked: true } | null> {
  const token = bearerToken(req);
  if (token) {
    const store = await getStore();
    const session = await getDesktopSession(store, token);
    if (!session) return null;
    const user = await store.getUserById(session.user.id);
    if (!user) return null;
    if (user.status === "bloqueado") return { blocked: true };
    return { user, store };
  }
  const current = await getSessionUser(readSessionCookie(req));
  if (!current) return null;
  if (current.user.status === "bloqueado") return { blocked: true };
  return { user: current.user, store: await getStore() };
}

export function originOk(req: Request): boolean {
  if (bearerToken(req) && !req.headers.get("origin")) return true;
  return sameOrigin(req);
}
