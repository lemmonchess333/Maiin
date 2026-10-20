/**
 * The address an email change is going to, kept on this device.
 *
 * Confirming a change (the link in the new inbox, often opened on another
 * device) ends this phone's session: Firebase revokes it. Login then said
 * "Welcome back", and the old address it was offered answered "Invalid
 * email or password". The new address is noted here when the change is
 * asked for (accountSecurity.requestEmailChange), so Login can say what
 * happened and fill it in; a sign-in, or the boot that sees the change
 * land, clears it.
 *
 * Its own module, with nothing but storage: Login is the first screen a
 * signed-out person sees, and accountSecurity brings the Functions SDK.
 */
import { readJson, remove, writeJson } from "./localStore";

const KEY = "tropos-email-change-pending";
/** Firebase's confirmation link does not outlive this. */
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function noteEmailChange(email: string, now = Date.now()): void {
  writeJson(KEY, { email, at: now });
}

export function pendingEmailChange(now = Date.now()): string | null {
  const note = readJson<{ email?: unknown; at?: unknown } | null>(KEY, null);
  if (
    !note ||
    typeof note.email !== "string" ||
    typeof note.at !== "number" ||
    now - note.at > TTL_MS
  )
    return null;
  return note.email;
}

export function clearEmailChange(): void {
  remove(KEY);
}
