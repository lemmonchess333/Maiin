import type { Page } from "@playwright/test";

/**
 * What a break-ui lab measures: elements that spill past their card or
 * the screen, text wider than its own box without an ellipsis (a figure
 * drawn over the one beside it, a long word cut off at the card's edge),
 * and text squeezed so narrow that it stacks a letter a line. Text that
 * ends in an ellipsis, on one line (`truncate`) or after several
 * (`line-clamp-*`), is truncating on purpose and is not counted.
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
        // Laid out but not drawn: it cannot visibly break.
        if (getComputedStyle(el).visibility === "hidden") continue;
        const label = `${el.tagName.toLowerCase()} "${(el.textContent ?? "")
          .trim()
          .slice(0, 40)}"`;
        const box = el.closest(card);
        const edge = Math.min(box ? box.getBoundingClientRect().right : vw, vw);
        if (rect.right > edge + 1) {
          out.push(`spills ${Math.round(rect.right - edge)}px: ${label}`);
        }
        const textOfOwn = Array.from(el.childNodes)
          .filter((n) => n.nodeType === Node.TEXT_NODE)
          .map((n) => n.textContent ?? "")
          .join(" ");
        const ownText = textOfOwn.trim() !== "";
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
        // Squeezed: three or more lines, more lines than words, and under
        // 3.5 characters a line is a column stacking its words a few
        // letters at a time (a title beside a button that would not give
        // way). Nothing overflows, so the checks above cannot see it. A
        // date wrapping a word a line, or a long word or address wrapping
        // across a wide box, is not this.
        // The text's own line boxes, counted from where each line sits.
        const tops = new Set<number>();
        for (const n of Array.from(el.childNodes)) {
          if (n.nodeType !== Node.TEXT_NODE) continue;
          const range = document.createRange();
          range.selectNodeContents(n);
          for (const r of Array.from(range.getClientRects()))
            if (r.width > 0) tops.add(Math.round(r.top));
        }
        const lines = tops.size;
        const words = textOfOwn.trim().split(/\s+/).length;
        const chars = textOfOwn.replace(/\s+/g, "").length;
        if (ownText && lines >= 3 && lines > words && chars / lines < 3.5) {
          out.push(`squeezed to ${el.clientWidth}px: ${label}`);
        }
      }
      return out;
    },
    { scope, card, ignore }
  );
}
