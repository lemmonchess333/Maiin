import AppScreen from "@/website/site/AppScreen";
import { MEDAL_ART } from "@/website/site/art";
import FeatureCards from "@/website/site/FeatureCards";
import FeatureSection from "@/website/site/FeatureSection";
import GetTheApp from "@/website/site/GetTheApp";
import PageHero from "@/website/site/PageHero";
import { SCREENS } from "@/website/site/screens";
import SiteLayout from "@/website/site/SiteLayout";

/** Three of the challenge medals (public/medals), the app's own art. */
const MEDALS: readonly { src: string; name: string }[] = [
  { src: MEDAL_ART.fastest5kGold, name: "The Fastest 5K medal in gold" },
  {
    src: MEDAL_ART.strengthBuilderSilver,
    name: "A Strength Builder medal in silver",
  },
  { src: MEDAL_ART.mileageBronze, name: "A Mileage medal in bronze" },
];

/**
 * The Social page: the feed, Circles, Spaces, leagues, challenges and who
 * sees what. Leagues, challenges and Spaces wait for enough people
 * (`enoughPeople.ts`), and the page says so rather than promise them on a
 * first day.
 */
export default function SocialPage() {
  return (
    <SiteLayout current="/social">
      <PageHero
        domain="brand"
        kicker="Social"
        heading="Train alongside your people"
        line="Share sessions with the people who follow you, plan meet-ups with a Circle of up to 8, and join a weekly league scored on your own plan."
        picture={<AppScreen screen={SCREENS.feed} eager />}
      />

      <FeatureSection
        heading="A league scored on your own plan"
        picture={<AppScreen screen={SCREENS.together} />}
      >
        <p>
          Join a league and each week you’re in a group of about 20. Your points
          are the share of your planned sessions you did, so a three-day week
          can win. The top move up a tier each Monday, through Bronze, Silver,
          Gold, Platinum and Diamond. Leave whenever you like.
        </p>
        <p>
          Leagues, challenges and Spaces appear once enough people are training
          on Tropos. Circles, the feed and follows work from your first day.
        </p>
      </FeatureSection>

      <FeatureCards
        id="together"
        heading="Training with other people"
        cards={[
          {
            heading: "Props and comments",
            body: "Share a lift or a run with the people who follow you, make it public, or keep it to yourself. Give props and comment on theirs.",
          },
          {
            heading: "A Circle of up to 8",
            body: "Plan a run or a lift with a time and a place, shown in each member’s own time, and see who’s in. A meet-up can repeat each week, a run can carry pace groups, and everyone still in hears about it a day before.",
          },
          {
            heading: "A Space for your race",
            body: "Spaces are for races and interests. Join the one for your race to see its members’ posts and public sessions, and, once five or more train in a week, their sessions and kilometres between them.",
          },
          {
            heading: "You choose who sees what",
            body: "Every follower is someone you accepted, unless you turn Approve followers off. Block or report anyone, and the start and end of the runs you share are hidden.",
          },
        ]}
      />

      <section
        aria-labelledby="challenges"
        className="mx-auto max-w-[70rem] px-4 py-14 lg:px-8 lg:py-20"
      >
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-20">
          <div className="max-w-xl">
            <h2
              id="challenges"
              className="text-[1.75rem] font-extrabold leading-[1.15] tracking-tight text-foreground lg:text-[2.5rem]"
            >
              Challenges with medals
            </h2>
            <p className="mt-4 text-[1.0625rem] leading-relaxed text-muted-foreground">
              Weekly, monthly and seasonal challenges, each with its own medal
              in bronze, silver and gold. Each month a community goal counts
              every run on Tropos towards one total, whether you joined or not.
            </p>
          </div>
          <ul className="flex items-end justify-center gap-4 lg:gap-6">
            {MEDALS.map((medal) => (
              <li key={medal.src}>
                <img
                  src={medal.src}
                  alt={medal.name}
                  loading="lazy"
                  decoding="async"
                  className="h-28 w-auto lg:h-36"
                />
              </li>
            ))}
          </ul>
        </div>
      </section>

      <GetTheApp
        heading="Train with people you know"
        line="Invite them from the app with your own link or code."
      />
    </SiteLayout>
  );
}
