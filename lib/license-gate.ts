import { getStore, type Store } from "./db";
import {
  LICENSE_MISSING_HINT,
  LICENSE_MISSING_TITLE,
} from "./license-messages";

export { LICENSE_MISSING_HINT, LICENSE_MISSING_TITLE };

export async function userHasPaidLicense(
  email: string,
  store?: Store,
): Promise<boolean> {
  const s = store ?? (await getStore());
  const licenses = await s.getLicensesByEmail(email);
  return licenses.length > 0;
}
