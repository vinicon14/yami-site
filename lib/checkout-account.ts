import { hashPassword } from "./auth";
import type { Store, User } from "./db";

export async function ensureCheckoutAccount(
  store: Store,
  email: string,
  password: string,
  name: string,
): Promise<User> {
  const normalized = email.trim().toLowerCase();
  const existing = await store.getUserByEmail(normalized);
  if (existing) return existing;
  if (password.length < 8 || password.length > 128) {
    throw new Error("senha_invalida");
  }
  const passwordHash = await hashPassword(password);
  return store.createUser({
    id: crypto.randomUUID(),
    email: normalized,
    name: name.trim().slice(0, 80) || "Usuário YAMI",
    passwordHash,
  });
}
