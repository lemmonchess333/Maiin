/** Only app-owned, same-account destinations may come from a push payload. */
export function nativePushRoute(data: unknown, uid: string): string | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const payload = data as Record<string, unknown>;
  if (payload.ownerUid !== uid) return null;
  if (payload.route === "/" || payload.route === "/program")
    return payload.route;
  if (payload.route === "/social" || payload.route === "/social?tab=together")
    return "/social?tab=together";
  return null;
}
