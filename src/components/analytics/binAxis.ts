/**
 * Which bars History's bar charts name underneath, and when the labels
 * give way to the chart's two ends (PeriodSummaryCard, TrainingWeeksCard).
 *
 * Each named bar has its label in its own share of the chart, wrapped a
 * word a line rather than run into the next ("14 / Sept"). What a label
 * cannot do is narrow past its longest word, so every bar keeps its label
 * while each share holds that word, and below that only the two ends are
 * named, at the chart's edges.
 *
 * How wide that is depends on how many bars there are, and so on the day:
 * the thirty days up to a Monday begin on a Sunday, so the 30-day range
 * draws six weeks on a Monday and five on every other day. A card that
 * holds five weeks' labels need not hold six: at 135% on a 320 px phone
 * the card is 11.3em, a sixth of it 41 px, and "week" 42.7 px.
 * largeText.capture.spec.ts measures History on a Monday for this.
 */
import type { SummaryGranularity } from "@/lib/periodSummary";

/**
 * The longest word under a chart, in em of the card: the current bar's
 * name, in the semibold it is drawn in at `text-xs`, measured in Plus
 * Jakarta Sans. Every other label is narrower: "Sept", "2025", "Wed".
 */
export const LONGEST_LABEL_WORD_EM: Record<SummaryGranularity, number> = {
  daily: 2.2, // "Today"
  weekly: 1.98, // "week", of "This week"
  monthly: 2.37, // "month", of "This month"
};

/**
 * A 320 px phone's card at the designed text size, where every bar keeps
 * its label. Seven months need 16.6em; at 16em "month" leans a pixel past
 * its share, into the card's padding, and all seven stay named.
 */
const DESIGNED_CARD_EM = 16;

interface GiveWay {
  /** The card's width, in its own em, below which the two ends take over. */
  below: number;
  /** For the row that names the bars: hidden below that width. */
  labels: string;
  /** For the row that names the two ends: shown below it. */
  ends: string;
}

export interface BinAxis extends GiveWay {
  /** One bar in `every` is named, counted back from the current one. */
  every: number;
}

/* Tailwind builds only the class names it finds written out whole, so
   each width is spelled out. A chart that needs a width between two takes
   the wider one, and gives way a little sooner. The narrowest, 11em, also
   takes five weeks (9.9em) with room to spare. */
const GIVE_WAY: readonly GiveWay[] = [
  { below: 11, labels: "@max-[11em]:hidden", ends: "@max-[11em]:flex" },
  { below: 12, labels: "@max-[12em]:hidden", ends: "@max-[12em]:flex" },
  { below: 14.5, labels: "@max-[14.5em]:hidden", ends: "@max-[14.5em]:flex" },
  { below: 15.5, labels: "@max-[15.5em]:hidden", ends: "@max-[15.5em]:flex" },
  { below: 16, labels: "@max-[16em]:hidden", ends: "@max-[16em]:flex" },
];

/** The axis under a chart of `bars` bars. */
export function binAxis(
  bars: number,
  granularity: SummaryGranularity
): BinAxis {
  /* Every bar is named while they fit; past seven, every few, counted
     back from the current bar so it is always named. Then each named bar
     has empty shares beside it, and the narrowest width applies. */
  const every = bars <= 7 ? 1 : Math.ceil(bars / 4);
  if (every > 1) return { every, ...GIVE_WAY[0] };
  const need = Math.min(
    DESIGNED_CARD_EM,
    bars * LONGEST_LABEL_WORD_EM[granularity]
  );
  const giveWay =
    GIVE_WAY.find((g) => g.below >= need) ?? GIVE_WAY[GIVE_WAY.length - 1];
  return { every, ...giveWay };
}
