import badge from "@/assets/app-store/download-on-the-app-store-black.svg";
import { APP_STORE_URL } from "@/lib/publicLinks";

/**
 * The website's one way on: Apple's "Download on the App Store" badge,
 * linking to Tropos's listing (`APP_STORE_URL`).
 *
 * The artwork is Apple's own file, unchanged: the US-UK English black
 * badge from Apple's Marketing Resources
 * (`Download_on_the_App_Store_Badge_US-UK_RGB_blk_092917.svg`, git blob
 * 072b425a). Apple's rules for it (App Store Marketing Guidelines,
 * developer.apple.com/app-store/marketing/guidelines): only Apple's
 * artwork, never modified, angled or animated; the black badge, whose
 * grey border is part of it; at least 40 px tall on screen; clear space
 * of a quarter of its height, with nothing inside it; one badge per
 * layout, below the main message; and a credit for Apple's marks
 * (`APPLE_CREDIT`). It is 48 px tall here (a Tropos choice: legible
 * and not the page's largest thing), so its clear space is 12 px.
 */
export const BADGE_HEIGHT_PX = 48;

/** Apple's artwork is 119.66 by 40. */
const BADGE_WIDTH_PX = Math.round((BADGE_HEIGHT_PX * 119.66407) / 40);

/** A quarter of the badge's height (Apple's minimum clear space). */
export const BADGE_CLEAR_SPACE_PX = BADGE_HEIGHT_PX / 4;

/** The credit Apple asks for wherever the badge is used. */
export const APPLE_CREDIT =
  "Apple and the Apple logo are trademarks of Apple Inc., registered in the U.S. and other countries and regions. App Store is a service mark of Apple Inc.";

/** The badge with its clear space above and below it. Beside it there is
 *  nothing: the page's margin on its left, the empty row on its right. */
export default function AppStoreBadge() {
  return (
    <div style={{ paddingBlock: BADGE_CLEAR_SPACE_PX }}>
      <a
        href={APP_STORE_URL}
        className="inline-block rounded-[9px] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-stage-foreground"
      >
        <img
          src={badge}
          alt="Download on the App Store"
          width={BADGE_WIDTH_PX}
          height={BADGE_HEIGHT_PX}
          draggable={false}
          className="block"
          style={{ width: BADGE_WIDTH_PX, height: BADGE_HEIGHT_PX }}
        />
      </a>
    </div>
  );
}
