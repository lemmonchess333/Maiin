/**
 * The address a shared card of a feed post ends with (App1 Q51): the
 * post's public page while the post is public. Read when the share sheet
 * opens, from the post itself, so a post made followers-only or private
 * since does not send people to "This post isn’t available". Any other
 * post, or one that cannot be read, gives undefined, and the card's words
 * keep the front door (`withAppLink`).
 *
 * Its own module, loaded by ShareCardSheet when a card has a post, so the
 * sheet carries no Firestore read for the cards that have none.
 */
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { publicPostUrl } from "@/lib/publicLinks";

export async function publicPostShareLink(
  activityId: string
): Promise<string | undefined> {
  try {
    const snap = await getDoc(doc(db, "activities", activityId));
    return snap.exists() && snap.data()?.visibility === "public"
      ? publicPostUrl(activityId)
      : undefined;
  } catch {
    return undefined;
  }
}
