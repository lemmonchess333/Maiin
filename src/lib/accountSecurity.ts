/**
 * Signed-in account-security operations (account table-stakes pass, 2026-07):
 * email verification, change password, change email. Consumed by
 * SecuritySection (Settings → Account) and the signup flow in auth.tsx.
 *
 * Change password / change email reauthenticate FIRST with the user's
 * current password (via the shared reauth helpers), which sidesteps the
 * `auth/requires-recent-login` dance entirely — the reauth is always fresh
 * by construction. Both are only offered to accounts with the "password"
 * provider; OAuth-only users add a password via the forgot-password flow
 * (the server callable mints a set-password link for any account).
 *
 * Email changes go through verifyBeforeUpdateEmail: Firebase emails a
 * confirmation link to the NEW address and only applies the change once
 * it's clicked — so a typo'd new email can't lock the account, and the
 * old address keeps working until the new one is proven. The profile-doc
 * `email` mirror is reconciled on next boot by auth.tsx (the change lands
 * out-of-band, after the user clicks the link).
 */
import {
  updatePassword,
  verifyBeforeUpdateEmail,
  type User,
} from "firebase/auth";
import { getFunctions, httpsCallable } from "firebase/functions";
import { reauthWithPassword } from "./reauth";

/**
 * Send (or resend) the branded verification email for the signed-in user.
 * Server callable — same Admin-mint + Resend path as password reset, so the
 * email comes from the branded sender, not noreply@<project>.firebaseapp.com.
 */
export async function sendVerificationEmail(): Promise<void> {
  const fn = httpsCallable<Record<string, never>, { ok: boolean }>(
    getFunctions(),
    "sendVerificationEmailCallable"
  );
  await fn({});
}

/** Reauth with the current password, then set the new one. */
export async function changePassword(
  user: User,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  await reauthWithPassword(user, currentPassword);
  await updatePassword(user, newPassword);
}

/**
 * Reauth with the current password, then send the confirm-change link to the
 * new address. The auth email only changes once that link is clicked.
 */
export async function requestEmailChange(
  user: User,
  currentPassword: string,
  newEmail: string
): Promise<void> {
  await reauthWithPassword(user, currentPassword);
  await verifyBeforeUpdateEmail(user, newEmail.trim());
}
