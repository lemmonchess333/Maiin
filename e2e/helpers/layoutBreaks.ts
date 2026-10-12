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
        // Words and letters from all of the element's text, links and
        // spans included: counted from its own text alone, a line of
        // links (the map credit's "OpenFreeMap © OpenMapTiles Data from
        // OpenStreetMap") read as " Data from " on three lines.
        const all = el.textContent ?? "";
        const words = all.trim().split(/\s+/).length;
        const chars = all.replace(/\s+/g, "").length;
        if (ownText && lines >= 3 && lines > words && chars / lines < 3.5) {
          out.push(`squeezed to ${el.clientWidth}px: ${label}`);
        }
      }
      return out;
    },
    { scope, card, ignore }
  );
}

/**
 * Ordinary words too wide for their line: a word of letters only, 15 or
 * fewer, split across lines when it is wider than the line it sits in. A
 * long compound, an address or a URL may wrap anywhere; a word like
 * "Notifications" that cannot fit on a line of its own means its box is
 * too narrow for it, and the fix is room for the word, not a hyphen.
 *
 * A word that would fit and was split anyway is hyphenation at the end
 * of a line ("ca-bles"), which iOS does too and is not a break. Whether a
 * browser hyphenates depends on its build: CI's Chromium does, the
 * container's older one did not, so the test is the word's width, not
 * whether it was split.
 */
export async function brokenWords(
  page: Page,
  ignore?: string
): Promise<string[]> {
  return page.evaluate(
    ({ ignore }) => {
      const out = new Set<string>();
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT
      );
      const range = document.createRange();
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const el = n.parentElement;
        if (!el || (ignore && el.closest(ignore))) continue;
        const style = getComputedStyle(el);
        if (style.visibility === "hidden" || style.display === "none") continue;
        const text = n.textContent ?? "";
        // An address or a link may break anywhere.
        if (/@|:\/\//.test(text)) continue;
        for (const m of text.matchAll(/\p{L}{2,15}/gu)) {
          range.setStart(n, m.index!);
          range.setEnd(n, m.index! + m[0].length);
          const rects = Array.from(range.getClientRects()).filter(
            (r) => r.width > 0
          );
          const tops = new Set(rects.map((r) => Math.round(r.top)));
          if (tops.size < 2) continue;
          // The word's width laid out whole, against the width of the
          // block its lines are set in.
          const width = rects.reduce((sum, r) => sum + r.width, 0);
          let block: Element | null = el;
          while (block && getComputedStyle(block).display.startsWith("inline"))
            block = block.parentElement;
          if (!block) continue;
          const bs = getComputedStyle(block);
          const line =
            block.clientWidth -
            parseFloat(bs.paddingLeft) -
            parseFloat(bs.paddingRight);
          if (width > line + 1)
            out.add(
              `breaks "${m[0]}" mid-word in ${el.tagName.toLowerCase()} "${text
                .trim()
                .slice(0, 30)}"`
            );
        }
      }
      return [...out];
    },
    { ignore }
  );
}
