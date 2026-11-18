import { useEffect } from "react";
import { applyWebsiteHead, type WebsiteHead } from "@/website/websiteHead";

/** Puts `head`'s canonical link and robots tag in the document's head
 *  while the page is shown (`websiteHead.ts`). */
export function useWebsiteHead(head: WebsiteHead): void {
  const { canonical, noindex } = head;
  useEffect(
    () => applyWebsiteHead({ canonical, noindex }),
    [canonical, noindex]
  );
}
