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
        // Laid out but not drawn: it cannot visibly break. Visually
        // hidden text is clipped to a 1px box on purpose, so its words
        // are always wider than that box.
        if (getComputedStyle(el).visibility === "hidden") continue;
        if (el.closest(".sr-only")) continue;
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
  ignore?: string,
  scope = "body"
): Promise<string[]> {
  return page.evaluate(
    ({ ignore, scope }) => {
      const out = new Set<string>();
      const texts: Node[] = [];
      for (const root of Array.from(document.querySelectorAll(scope))) {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) texts.push(n);
      }
      const range = document.createRange();
      for (const n of texts) {
        const el = n.parentElement;
        if (!el || (ignore && el.closest(ignore))) continue;
        const style = getComputedStyle(el);
        if (style.visibility === "hidden" || style.display === "none") continue;
        const text = n.textContent ?? "";
        // An address or a link may break anywhere.
        if (/@|:\/\//.test(text)) continue;
        // Whole runs of letters: a 44-letter compound is one long word,
        // not three ordinary ones of 15.
        for (const m of text.matchAll(/\p{L}+/gu)) {
          if (m[0].length < 2 || m[0].length > 15) continue;
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
    { ignore, scope }
  );
}

/**
 * Text drawn through a picture beside it. In each `card`, a line of text
 * that crosses a drawing, where the drawing actually paints: an image
 * fitted with `object-fit: contain` paints less than its box, and the
 * measure is what it paints. A picture as wide as its card is a
 * background, which text may sit on (a run's distance over its route);
 * one that takes part of the width is a figure, and the words beside it
 * have to give way to it. Nothing overflows when they do not, so the
 * box checks above cannot see it. Icons are too small to count.
 *
 * `scope` is the region whose pictures are measured; `card`, the box a
 * picture shares with the text measured against it.
 */
export async function textOverArt(
  page: Page,
  scope: string,
  card: string
): Promise<string[]> {
  return page.evaluate(
    ({ scope, card }) => {
      const out = new Set<string>();
      const ART = 'img, svg[role="img"], svg[aria-hidden="true"]';
      const FIGURE = 64;
      const painted = (el: Element): DOMRect => {
        const box = el.getBoundingClientRect();
        if (!(el instanceof HTMLImageElement) || !el.naturalWidth) return box;
        const style = getComputedStyle(el);
        if (style.objectFit !== "contain" && style.objectFit !== "scale-down")
          return box;
        const fit = Math.min(
          box.width / el.naturalWidth,
          box.height / el.naturalHeight,
          style.objectFit === "scale-down" ? 1 : Infinity
        );
        const w = el.naturalWidth * fit;
        const h = el.naturalHeight * fit;
        // object-position computes to two lengths or percentages.
        const [px, py] = style.objectPosition.split(" ");
        const offset = (value: string, free: number) =>
          value.endsWith("%")
            ? (parseFloat(value) / 100) * free
            : parseFloat(value) || 0;
        return new DOMRect(
          box.left + offset(px ?? "50%", box.width - w),
          box.top + offset(py ?? "50%", box.height - h),
          w,
          h
        );
      };
      const range = document.createRange();
      for (const art of Array.from(document.querySelectorAll(ART))) {
        if (!art.closest(scope)) continue;
        const style = getComputedStyle(art);
        if (style.visibility === "hidden" || style.display === "none") continue;
        const drawn = painted(art);
        if (Math.max(drawn.width, drawn.height) < FIGURE) continue;
        const host = art.closest(card);
        if (!host) continue;
        // As wide as its card: a background.
        const box = art.getBoundingClientRect();
        if (box.width >= host.getBoundingClientRect().width * 0.9) continue;
        const what =
          art.getAttribute("aria-label") ||
          art.getAttribute("src")?.split("/").pop() ||
          art.tagName.toLowerCase();
        const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          const text = (n.textContent ?? "").trim();
          const el = n.parentElement;
          if (!text || !el || art.contains(el) || el.closest(".sr-only"))
            continue;
          const es = getComputedStyle(el);
          if (es.visibility === "hidden" || es.display === "none") continue;
          range.selectNodeContents(n);
          for (const r of Array.from(range.getClientRects())) {
            const x =
              Math.min(r.right, drawn.right) - Math.max(r.left, drawn.left);
            const y =
              Math.min(r.bottom, drawn.bottom) - Math.max(r.top, drawn.top);
            if (x > 1 && y > 1) {
              out.add(
                `"${text.slice(0, 30)}" runs ${Math.round(x)}px into the ${what}`
              );
              break;
            }
          }
        }
      }
      return [...out];
    },
    { scope, card }
  );
}

/**
 * Names cut short. Each element `names` matches is a person's name, which
 * may end in an ellipsis when the row has no more room, but never before
 * its first word is whole: "Aleksandra W…" still names someone,
 * "Ale…" does not, and at that width the row has to wrap instead.
 */
export async function clippedNames(
  page: Page,
  names: string
): Promise<string[]> {
  return page.evaluate(
    ({ names }) => {
      const out: string[] = [];
      const range = document.createRange();
      for (const el of Array.from(document.querySelectorAll(names))) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        const style = getComputedStyle(el);
        const clamped =
          style.webkitLineClamp !== "" && style.webkitLineClamp !== "none";
        const cut =
          (style.textOverflow === "ellipsis" &&
            el.scrollWidth > el.clientWidth + 1) ||
          (clamped && el.scrollHeight > el.clientHeight + 1);
        if (!cut) continue;
        const text = el.firstChild;
        const name = (el.textContent ?? "").trim();
        const first = name.match(/^\S+/)?.[0] ?? "";
        if (!text || text.nodeType !== Node.TEXT_NODE || !first) continue;
        const start = (text.textContent ?? "").indexOf(first);
        range.setStart(text, start);
        range.setEnd(text, start + first.length);
        // The first word laid out whole, against the room it was given:
        // wider than the line, or (clamped) running past the last line.
        const word = range.getBoundingClientRect();
        const room = el.clientWidth;
        if (word.width > room + 1 || word.bottom > rect.bottom + 1)
          out.push(
            `cuts "${name.slice(0, 30)}" inside "${first}" (${room}px of ${Math.round(word.width)}px)`
          );
      }
      return out;
    },
    { names }
  );
}
