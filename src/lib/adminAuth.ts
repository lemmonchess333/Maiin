/**
 * Client-side admin gate. Mirrors `functions/adminAuth.js` — the
 * server is the trust boundary, this one only controls UI
 * visibility (hide the /admin/moderation link from non-admins,
 * redirect away on direct navigation).
 *
 * Allowlist comes from `VITE_ADMIN_UIDS` at build time. Empty
 * env var → no admins → the moderation route renders a 403
 * placeholder for any signed-in user. Operator sets the env via
 * a `.env.production` entry or the deploy workflow's `env:` block.
 */

function getAdminAllowlist(): Set<string> {
  const raw = (import.meta.env.VITE_ADMIN_UIDS as string | undefined) || "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export function isAdminUid(uid: string | null | undefined): boolean {
  if (typeof uid !== "string" || !uid) return false;
  return getAdminAllowlist().has(uid);
}
