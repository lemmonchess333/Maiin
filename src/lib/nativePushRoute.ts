/** A plain document id: what a post, a Space, a Space post or a person is
 *  named by in a push (functions/lib/socialPush.js builds them). */
const ID = "[A-Za-z0-9_-]{1,128}";

/** A post, a Space post or a person, from a push about a comment, a
 *  follow request or an invite (App1 Q18), as the tray's row opens them. */
const ID_ROUTES = [
  new RegExp(`^/activity/${ID}(?:\\?comments=1)?$`),
  new RegExp(`^/space/${ID}/post/${ID}(?:\\?comments=1)?$`),
  new RegExp(`^/user/${ID}$`),
];

/** Only app-owned, same-account destinations may come from a push payload.
 *  The service workers (`public/sw.js`, `public/firebase-messaging-sw.js`)
 *  hold the web's copy of the same rule. */
export function nativePushRoute(data: unknown, uid: string): string | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const payload = data as Record<string, unknown>;
  if (payload.ownerUid !== uid) return null;
  const route = payload.route;
  if (
    route === "/" ||
    route === "/program" ||
    route === "/review" ||
    route === "/league"
  )
    return route;
  if (route === "/social" || route === "/social?tab=together")
    return "/social?tab=together";
  if (typeof route === "string" && ID_ROUTES.some((p) => p.test(route)))
    return route;
  return null;
}
