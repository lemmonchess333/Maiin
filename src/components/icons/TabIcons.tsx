import type { ComponentType, ReactNode } from "react";

/** What the tab bar hands each icon: whether its tab is the one open. */
export interface TabIconProps {
  active: boolean;
  className?: string;
}

export type TabIcon = ComponentType<TabIconProps>;

/**
 * The tab bar's own icons (DS3). Stock icons drew the five destinations
 * in five different hands, and filling a stock outline for the open tab
 * filled some of them oddly (the dumbbell's bar, the chart's baseline).
 * These are drawn together on one 24 grid, with one stroke, and each has
 * a filled form made for the open tab, the way the platform draws its
 * own selected tabs. The house's roof takes the hexagon's pitch.
 *
 * The filled forms keep the outline's stroke as well as the fill, so a
 * tab does not change size as it opens.
 */
function Glyph({
  active,
  className,
  outline,
  filled,
}: TabIconProps & { outline: ReactNode; filled: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      data-tab-icon={active ? "filled" : "outline"}
      className={className}
    >
      {active ? filled : outline}
    </svg>
  );
}

/* Hexagon pitch: the roof rises 4.8 over a half-width of 8.5, the slope
   of the brand hexagon's upper edges. */
const HOUSE =
  "M3.5 9 12 4.2 20.5 9v9.5a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5Z";

export function HomeTabIcon(props: TabIconProps) {
  return (
    <Glyph
      {...props}
      outline={
        <>
          <path d={HOUSE} />
          <path d="M9.75 20v-4.75a1 1 0 0 1 1-1h2.5a1 1 0 0 1 1 1V20" />
        </>
      }
      filled={
        /* One outline with the doorway notched into it: a door cut as a
           hole would be stroked shut by the fill's own outline. */
        <path
          fill="currentColor"
          d="M3.5 9 12 4.2 20.5 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-4.25v-4.9a1.2 1.2 0 0 0-1.2-1.2h-3.1a1.2 1.2 0 0 0-1.2 1.2V20H5a1.5 1.5 0 0 1-1.5-1.5Z"
        />
      }
    />
  );
}

const PLATES = [
  { x: 6, y: 6.5, width: 2.5, height: 11 },
  { x: 15.5, y: 6.5, width: 2.5, height: 11 },
  { x: 3.25, y: 9, width: 2.75, height: 6 },
  { x: 18, y: 9, width: 2.75, height: 6 },
] as const;

export function TrainTabIcon(props: TabIconProps) {
  const plates = (fill?: string) =>
    PLATES.map((plate) => <rect key={plate.x} {...plate} rx={1} fill={fill} />);
  return (
    <Glyph
      {...props}
      outline={
        <>
          {plates()}
          <path d="M8.5 12h7" />
        </>
      }
      filled={
        <>
          {plates("currentColor")}
          <path d="M8.5 12h7" />
        </>
      }
    />
  );
}

const BOWL = "M3.5 12h17a8.5 8.5 0 0 1-17 0Z";
const LEAF = "M12 12c0-3.4 1.7-6 5.5-7-.1 3.6-2 6-5.5 7Z";

export function FoodTabIcon(props: TabIconProps) {
  return (
    <Glyph
      {...props}
      outline={
        <>
          <path d={BOWL} />
          <path d={LEAF} />
        </>
      }
      filled={
        <>
          <path d={BOWL} fill="currentColor" />
          <path d={LEAF} fill="currentColor" />
        </>
      }
    />
  );
}

const FRONT_BODY =
  "M3 19.5v-.75A4.75 4.75 0 0 1 7.75 14h2.5A4.75 4.75 0 0 1 15 18.75v.75";

export function SocialTabIcon(props: TabIconProps) {
  /* The person behind is two open strokes either way: filled, the pair
     would merge into one shape at 20 px. */
  const behind = (
    <>
      <path d="M15.2 5.2a3 3 0 0 1 0 5.6" />
      <path d="M17.5 14.2a4.5 4.5 0 0 1 3.5 4.4v.9" />
    </>
  );
  return (
    <Glyph
      {...props}
      outline={
        <>
          <circle cx={9} cy={8} r={3.25} />
          <path d={FRONT_BODY} />
          {behind}
        </>
      }
      filled={
        <>
          <circle cx={9} cy={8} r={3.25} fill="currentColor" />
          <path d={`${FRONT_BODY}Z`} fill="currentColor" />
          {behind}
        </>
      }
    />
  );
}

const BARS = [
  { x: 4.25, y: 13.5, height: 6.5 },
  { x: 10.25, y: 9.5, height: 10.5 },
  { x: 16.25, y: 5, height: 15 },
] as const;

export function AnalyticsTabIcon(props: TabIconProps) {
  const bars = (fill?: string) =>
    BARS.map((bar) => (
      <rect key={bar.x} {...bar} width={3.5} rx={1.1} fill={fill} />
    ));
  return <Glyph {...props} outline={bars()} filled={bars("currentColor")} />;
}
