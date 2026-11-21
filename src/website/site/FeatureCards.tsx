import type { ReactNode } from "react";

/**
 * Things the app does that have no screen of their own on the page: a
 * heading over a grid of cards, two to a row on a wide window, so a run
 * of them never leaves half the page empty.
 */
export default function FeatureCards({
  id,
  heading,
  cards,
}: {
  id: string;
  heading: string;
  cards: readonly { heading: string; body: ReactNode }[];
}) {
  return (
    <section
      aria-labelledby={id}
      className="mx-auto max-w-[70rem] px-4 py-14 lg:px-8 lg:py-20"
    >
      <h2
        id={id}
        className="text-[1.75rem] font-extrabold leading-[1.15] tracking-tight text-foreground text-balance lg:text-[2.5rem]"
      >
        {heading}
      </h2>
      <ul className="mt-8 grid gap-4 lg:grid-cols-2 lg:gap-6">
        {cards.map((card) => (
          <li
            key={card.heading}
            className="rounded-2xl bg-card p-4 card-shadow lg:p-8"
          >
            <h3 className="text-lg font-bold text-foreground lg:text-xl">
              {card.heading}
            </h3>
            <div className="site-prose mt-2 text-base leading-relaxed text-muted-foreground">
              {card.body}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
