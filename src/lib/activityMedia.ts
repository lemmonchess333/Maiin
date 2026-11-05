/**
 * Gateway readers treat media URLs as identifiers, never image sources. The callable
 * checks the current post, follower edge and both block directions on
 * every read, including for posts written by older clients.
 */
import { httpsCallable } from "firebase/functions";
import { auth, functions } from "./firebase";

export interface ActivityMediaKey {
  activityId: string;
  kind: "photo" | "map";
  id: string;
}

const BUCKET = /^adaptive-fitness-af8bb\.(firebasestorage\.app|appspot\.com)$/;
const SEGMENT = /^[A-Za-z0-9_-]{1,128}$/;
const PHOTO_ID = /^[A-Za-z0-9_-]{8,64}$/;

/** Extract only a known object identity. Never fetch a supplied URL,
 * retain its token, or forward it to another service. */
export function activityMediaKey(value: unknown): ActivityMediaKey | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (
      url.origin !== "https://firebasestorage.googleapis.com" ||
      url.username ||
      url.password
    )
      return null;
    const match = /^\/v0\/b\/([^/]+)\/o\/([^/]+)$/.exec(url.pathname);
    if (!match || !BUCKET.test(match[1])) return null;
    const [prefix, uid, activityId, name, extra] = decodeURIComponent(
      match[2]
    ).split("/");
    if (
      extra !== undefined ||
      !SEGMENT.test(uid ?? "") ||
      !SEGMENT.test(activityId ?? "")
    )
      return null;
    if (prefix === "route-maps" && /^(light|dark)\.jpg$/.test(name ?? ""))
      return { activityId, kind: "map", id: name.slice(0, -4) };
    if (
      prefix === "post-photos" &&
      name?.endsWith(".jpg") &&
      PHOTO_ID.test(name.slice(0, -4))
    )
      return { activityId, kind: "photo", id: name.slice(0, -4) };
    return null;
  } catch {
    return null;
  }
}

const MAX_BASE64 = Math.ceil((2 * 1024 * 1024) / 3) * 4;

/** No disk, service-worker or cross-user image cache. Callers own and
 * revoke the returned object URL when the image is no longer needed. */
export async function readActivityMediaUrl(
  value: string,
  reportId?: string
): Promise<string> {
  const key = activityMediaKey(value);
  const uid = auth.currentUser?.uid;
  if (!key || !uid) throw new Error("Media unavailable");
  const read = httpsCallable<
    ActivityMediaKey | { reportId: string; id: string },
    { base64: string; contentType: string }
  >(functions, reportId ? "readReportedActivityMedia" : "readActivityMedia");
  if (reportId && key.kind !== "photo") throw new Error("Media unavailable");
  const { data } = await read(reportId ? { reportId, id: key.id } : key);
  if (
    auth.currentUser?.uid !== uid ||
    data?.contentType !== "image/jpeg" ||
    typeof data.base64 !== "string" ||
    data.base64.length > MAX_BASE64 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(data.base64)
  )
    throw new Error("Media unavailable");
  const bytes = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
  return URL.createObjectURL(new Blob([bytes], { type: "image/jpeg" }));
}
