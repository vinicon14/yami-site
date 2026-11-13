import { getSessionUser, readSessionCookie } from "./auth";
import { isValidEmail } from "./http";

export function parseAdminEmails(raw: string | undefined = process.env.ADMIN_EMAILS): string[] {
  return (raw ?? "")
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length > 0 && isValidEmail(part));
}

export function isAdminEmail(
  email: string,
  raw: string | undefined = process.env.ADMIN_EMAILS,
): boolean {
  const list = parseAdminEmails(raw);
  if (list.length === 0) return false;
  return list.includes(email.trim().toLowerCase());
}

export async function getAdminFromRequest(req: Request): Promise<
  | { ok: true; user: { id: string; email: string; name: string | null } }
  | { ok: false; status: 401 | 403; error: string }
> {
  const session = await getSessionUser(readSessionCookie(req));
  if (!session) {
    return { ok: false, status: 401, error: "não autenticado" };
  }
  if (!isAdminEmail(session.user.email)) {
    return { ok: false, status: 403, error: "sem permissão" };
  }
  return {
    ok: true,
    user: { id: session.user.id, email: session.user.email, name: session.user.name },
  };
}
