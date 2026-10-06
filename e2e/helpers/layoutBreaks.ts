import type { Page } from "@playwright/test";

/**
 * What a break-ui lab measures: elements that spill past their card or
 * the screen, and text wider than its own box without an ellipsis (a
 * figure drawn over the one beside it, a long word cut off at the card's
 * edge). Text that ends in an ellipsis, on one line (`truncate`) or
 * after several (`line-clamp-*`), is truncating on purpose and is not
 * counted.
 *
 * `scope` selects the elements to measure (descendants included);
 * `card` is the selector of the box an element must stay inside;
 * `ignore`, if given, skips any element inside a match: a row that
 * scrolls sideways on purpose, decoration hidden from assistive tech.
 */
export async function layoutBreaks(
  page: Page,
  scope: string,
  card: string,
  ignore?: string
): Promise<string[]> {
  return page.evaluate(
    ({ scope, card, ignore }) => {
      const out: string[] = [];
      const vw = document.documentElement.clientWidth;
      for (const el of Array.from(document.querySelectorAll(scope))) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        if (ignore && el.closest(ignore)) continue;
        const label = `${el.tagName.toLowerCase()} "${(el.textContent ?? "")
          .trim()
          .slice(0, 40)}"`;
        const box = el.closest(card);
        const edge = Math.min(box ? box.getBoundingClientRect().right : vw, vw);
        if (rect.right > edge + 1) {
          out.push(`spills ${Math.round(rect.right - edge)}px: ${label}`);
        }
        const ownText = Array.from(el.childNodes).some(
          (n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim() !== ""
        );
        const style = getComputedStyle(el);
        const truncates =
          style.textOverflow === "ellipsis" ||
          (style.webkitLineClamp !== "" && style.webkitLineClamp !== "none");
        if (
          ownText &&
          el.clientWidth > 0 &&
          el.scrollWidth > el.clientWidth + 1 &&
          !truncates
        ) {
          out.push(
            `overflows its box by ${el.scrollWidth - el.clientWidth}px: ${label}`
          );
        }
      }
      return out;
    },
    { scope, card, ignore }
  );
}
