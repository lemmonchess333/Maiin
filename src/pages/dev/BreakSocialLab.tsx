import { useSearchParams } from "react-router-dom";
import ActivityCard from "@/components/social/ActivityCard";
import LeaderboardRow from "@/components/social/LeaderboardRow";
import { BOARD, FEED, type BreakDataset } from "./breakSocialFixtures";

/*
 * DEV/TEST-ONLY break-social lab. Not in production builds; see the route
 * gating in App.tsx (same pattern as BrandBakeoff).
 *
 * The feed's activity card and the leaderboard row, rendered with the
 * data the app is usually looked at with and with the worst data real
 * people produce (breakSocialFixtures.ts). The data swaps at the props,
 * the same boundary the feed fills, so a break here is a break in the
 * component. `?data=` keeps the choice across a reload.
 */
const DATASETS: { key: BreakDataset; label: string }[] = [
  { key: "demo", label: "Demo data" },
  { key: "worst", label: "Worst case" },
  { key: "one", label: "One" },
];

export default function BreakSocialLab() {
  const [params, setParams] = useSearchParams();
  const raw = params.get("data");
  const dataset: BreakDataset = raw === "worst" || raw === "one" ? raw : "demo";

  return (
    <div className="min-h-screen bg-background px-4 pt-6 pb-28 space-y-6">
      <header className="space-y-1">
        <h1 className="text-h2 font-extrabold">Break social</h1>
        <p className="text-small text-muted-foreground">
          Activity cards and leaderboard rows with{" "}
          {DATASETS.find((d) => d.key === dataset)?.label.toLowerCase()}.
        </p>
      </header>

      <section aria-label="Activity cards" className="space-y-3">
        {FEED[dataset].map((item) => (
          <ActivityCard
            key={item.id}
            feedItem={item}
            followAuthor
            onShare={() => {}}
          />
        ))}
      </section>

      <section aria-label="Leaderboard rows" className="space-y-1">
        <div className="rounded-2xl bg-card p-2 card-shadow space-y-1">
          {BOARD[dataset].map((row) => (
            <LeaderboardRow key={row.uid} {...row} />
          ))}
        </div>
      </section>

      {/* Chrome, not design: plain and fixed, out of the way. */}
      <div
        role="radiogroup"
        aria-label="Data"
        className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex gap-1 rounded-full bg-muted p-1 font-sans text-xs shadow"
      >
        {DATASETS.map((d) => (
          <button
            key={d.key}
            type="button"
            role="radio"
            aria-checked={dataset === d.key}
            onClick={() => setParams({ data: d.key }, { replace: true })}
            className={`rounded-full px-3 py-1.5 ${
              dataset === d.key
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground"
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>
    </div>
  );
}
