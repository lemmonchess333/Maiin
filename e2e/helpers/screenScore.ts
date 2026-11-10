/**
 * The browser half of the screen scorer: reads off a live page the figures
 * `scripts/design-qa/screenScore.ts` checks against the measured rules.
 * Approximate on purpose (see that file's header): a block is "the hero"
 * because it is the largest card, image or marked hero in the first
 * screen, not because anyone said so.
 */
import type { Page } from "@playwright/test";
import type { DomFigures } from "../../scripts/design-qa/screenScore";

/** Filled Button variants, by the classes `buttonClasses.ts` gives them. */
const FILLED =
  /(^|\s)bg-(primary-strong|foreground|running-fill|nutrition-fill|destructive)(\s|$)/;

export async function readDomFigures(
  page: Page,
  kind: DomFigures["kind"]
): Promise<DomFigures> {
  return page.evaluate(
    ({ kind, filledSource }) => {
      const FILLED_RE = new RegExp(filledSource);
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const theme = document.documentElement.classList.contains("dark")
        ? "dark"
        : "light";
      const main = document.querySelector("main") ?? document.body;

      const visible = (el: Element) => {
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) return false;
        const s = getComputedStyle(el);
        return (
          s.visibility !== "hidden" &&
          s.display !== "none" &&
          Number(s.opacity) > 0.05
        );
      };
      const inControlRow = (el: Element) =>
        !!el.closest(
          'header, nav, [role="radiogroup"], [role="tablist"], [role="navigation"]'
        );

      // The tab bar: the fixed navigation at the bottom of the screen.
      const nav = [...document.querySelectorAll("nav")].find((n) => {
        const r = n.getBoundingClientRect();
        return getComputedStyle(n).position === "fixed" && r.bottom >= vh - 2;
      });
      const bottomChrome = nav ? vh - nav.getBoundingClientRect().top : 0;
      const usableBottom = vh - bottomChrome;

      // Blocks: cards (rounded, filled or shadowed), images and drawings
      // at least 60% of the width, and anything marked as a hero.
      const blocks = [...main.querySelectorAll<HTMLElement>("*")].filter(
        (el) => {
          if (!visible(el) || inControlRow(el)) return false;
          const r = el.getBoundingClientRect();
          if (r.height < 64 || r.width < vw * 0.6) return false;
          if (
            el.matches('[data-testid*="hero"], [data-hero], img, canvas, svg')
          )
            return true;
          const s = getComputedStyle(el);
          const rounded = parseFloat(s.borderTopLeftRadius) >= 12;
          const filled =
            s.backgroundImage !== "none" ||
            s.boxShadow !== "none" ||
            !/rgba\(\s*0,\s*0,\s*0,\s*0\s*\)|transparent/.test(
              s.backgroundColor
            );
          return rounded && filled;
        }
      );
      // Section headings count as content too: "This week" over its cards.
      const headings = [...main.querySelectorAll("h2")].filter(
        (h) => visible(h) && !inControlRow(h)
      );
      const tops = [...blocks, ...headings]
        .map((el) => el.getBoundingClientRect().top)
        .filter((t) => t >= 0 && t < usableBottom);
      const firstContentTop = tops.length ? Math.min(...tops) : null;

      // A screen that marks its hero (`data-hero`, or a test id naming
      // one) is taken at its word, the highest such block in the first
      // screen; otherwise the largest block is taken for the hero.
      const marked = blocks
        .filter((el) => el.matches('[data-hero], [data-testid*="hero"]'))
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.top < usableBottom && r.bottom > 0;
        })
        .sort(
          (a, b) =>
            a.getBoundingClientRect().top - b.getBoundingClientRect().top
        );
      let hero: HTMLElement | null = marked[0] ?? null;
      let heroArea = marked.length ? Infinity : 0;
      for (const el of marked.length ? [] : blocks) {
        const r = el.getBoundingClientRect();
        const seen = Math.max(
          0,
          Math.min(r.bottom, usableBottom) - Math.max(r.top, 0)
        );
        // An outer block wins over the cards inside it only when it is
        // markedly larger, so a page's wrapper does not count as its hero.
        const area = seen * r.width;
        if (area > heroArea * 1.15) {
          if (hero && el.contains(hero) && area < heroArea * 1.6) continue;
          hero = el;
          heroArea = area;
        }
      }
      const heroRect = (hero as HTMLElement | null)?.getBoundingClientRect();

      // Text in the first screen: each visible text node's font size.
      const sizes = new Map<number, Element[]>();
      const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!n.textContent?.trim()) continue;
        const el = n.parentElement;
        if (!el || !visible(el)) continue;
        const r = el.getBoundingClientRect();
        if (r.top >= usableBottom || r.bottom <= 0) continue;
        if (el.closest(".sr-only")) continue;
        const px =
          Math.round(parseFloat(getComputedStyle(el).fontSize) * 2) / 2;
        sizes.set(px, [...(sizes.get(px) ?? []), el]);
      }
      const textSizes = [...sizes.keys()].sort((a, b) => b - a);
      const largestEls = textSizes.length
        ? (sizes.get(textSizes[0]) ?? [])
        : [];
      const heroEl = hero as HTMLElement | null;
      const largestTextInHero =
        heroEl !== null &&
        largestEls.length > 0 &&
        largestEls.every((textEl) => heroEl.contains(textEl));

      const filledButtons = [
        ...document.querySelectorAll<HTMLElement>("button, a"),
      ]
        .filter((b) => visible(b) && FILLED_RE.test(b.className))
        .map((b) => ({
          label: (b.getAttribute("aria-label") ?? b.textContent ?? "")
            .trim()
            .slice(0, 40),
          neutral: /(^|\s)bg-foreground(\s|$)/.test(b.className),
        }));

      const rowsEls = [
        ...main.querySelectorAll('li, [role="listitem"]'),
      ].filter(visible);
      const withPicture = rowsEls.filter((row) =>
        [...row.querySelectorAll("img, svg, canvas, [data-medal-tier]")].some(
          (p) => {
            const r = p.getBoundingClientRect();
            return r.width >= 28 && r.height >= 28;
          }
        )
      ).length;

      const label = heroEl
        ? heroEl.getAttribute("aria-label") ||
          heroEl.getAttribute("data-testid") ||
          heroEl.textContent?.trim().slice(0, 40) ||
          heroEl.tagName.toLowerCase()
        : "";

      return {
        viewport: { width: vw, height: vh },
        theme,
        kind,
        firstContentTop,
        hero: heroRect
          ? {
              top: heroRect.top,
              visibleHeight:
                Math.min(heroRect.bottom, usableBottom) -
                Math.max(heroRect.top, 0),
              label,
            }
          : null,
        bottomChrome,
        textSizes,
        largestTextInHero,
        filledButtons,
        rows: { total: rowsEls.length, withPicture },
      } satisfies DomFigures;
    },
    { kind, filledSource: FILLED.source }
  );
}
