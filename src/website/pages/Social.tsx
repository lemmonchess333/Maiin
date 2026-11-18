import crew from "@/assets/welcome/welcome-3-crew.webp";
import TierBadge from "@/features/league/TierBadge";
import { LEAGUE_TIERS } from "@/features/league/leagueRules";
import AppScreen from "@/website/blocks/AppScreen";
import ArtHero from "@/website/blocks/ArtHero";
import Feature from "@/website/blocks/Feature";
import GetTheApp from "@/website/blocks/GetTheApp";
import SiteLayout from "@/website/chrome/SiteLayout";
import challengeBoard from "@/website/screens/challenge-board.webp";
import { sitePage } from "@/website/sitePages";
import { sitePageHead, usePageHead } from "@/website/usePageHead";

/** One challenge's three medals, from public/medals/. */
const MEDALS = ["bronze", "silver", "gold"] as const;

/**
 * troposfit.com/social: people first (Strava's order), then what they do
 * together: Circles, challenges and medals, the league, Spaces, and the
 * person's own say over who sees what. Leagues, challenges and Spaces are
 * held back until enough people train on Tropos (App1 Q6,
 * `enoughPeople.ts`), and the page says so rather than show an empty room
 * as a busy one.
 */
export default function Social() {
  usePageHead(sitePageHead(sitePage("social")));
  return (
    <SiteLayout>
      <ArtHero
        kicker="Social"
        kickerClass="text-lifting-strong"
        title="Train with the people you know"
        lede="Share a session with the people who follow you. Give props, comment, and choose who sees each one."
        light="lifting"
        picture={
          <img
            src={crew}
            alt="Three women running together, laughing."
            width={1080}
            height={2340}
            decoding="async"
            fetchPriority="high"
            className="w-full max-w-[18rem] aspect-[3/4] object-cover rounded-[28px]"
            style={{ objectPosition: "50% 45%" }}
          />
        }
      />

      <Feature
        title="A Circle for the people you train with"
        points={[
          "Up to 8 people, and a focus for the week",
          "Meet-ups for a run or a lift, with a time and a place",
          "A reminder about a day before, for everyone going",
        ]}
      >
        <p>
          Start a Circle with friends, a running group or a gym partner. Check
          in on the week, back each other’s check-ins and plan when you’ll next
          train together.
        </p>
      </Feature>

      <Feature
        flip
        title="Challenges, and a medal for each"
        points={[
          "Weekly, monthly and seasonal challenges",
          "Bronze, silver and gold in each",
          "Your medals kept in the trophy case on your profile",
        ]}
        picture={
          <AppScreen
            src={challengeBoard}
            alt="A weekly challenge in Tropos: Weekly Warrior, 3 days left, its bronze medal, and a board of who has trained most this week."
            width={722}
            height={886}
          />
        }
      >
        <p>
          Join a challenge and the sessions you already log count toward it.
          Challenges open once at least 10 people are training on Tropos.
        </p>
        <ul className="flex gap-3 pt-2" aria-hidden="true">
          {MEDALS.map((tier) => (
            <li key={tier}>
              <img
                src={`/medals/active-days-${tier}.webp`}
                alt=""
                width={72}
                height={72}
                loading="lazy"
                decoding="async"
              />
            </li>
          ))}
        </ul>
      </Feature>

      <Feature
        title="A weekly league, scored against your own plan"
        points={[
          "About 20 people a group, from Monday to Sunday",
          "Points out of 100 for the share of your plan you did",
          "Five tiers from Bronze to Diamond: move up, hold or move down",
        ]}
        picture={
          <ul
            className="flex flex-wrap items-end justify-center gap-4 rounded-[24px] bg-card card-shadow p-8"
            aria-label="The five league tiers"
          >
            {LEAGUE_TIERS.map((tier) => (
              <li key={tier} className="text-center">
                <TierBadge tier={tier} size={56} />
                <p className="mt-2 text-xs font-semibold capitalize text-muted-foreground">
                  {tier}
                </p>
              </li>
            ))}
          </ul>
        }
      >
        <p>
          Join one if you want a stake in the week. Three sessions done of three
          planned beats six runs half done. Leagues open once at least 10 people
          are training on Tropos.
        </p>
      </Feature>

      <Feature
        flip
        title="Spaces for races and interests"
        points={[
          "See how many people on Tropos are training for your race",
          "What a Space’s members did this week",
          "Posts and comments from people in it",
        ]}
      >
        <p>
          Races have their own Spaces. Join the one for the race you’re training
          for, or one for a way of training you like.
        </p>
        <p className="text-base">
          Spaces open once at least 10 people are training on Tropos. Circles,
          the feed and following work from your first day.
        </p>
      </Feature>

      <Feature
        title="Who sees what is up to you"
        points={[
          "Approve each new follower, or turn approval off",
          "Share each session with your followers, with everyone or not at all",
          "Block or report anyone",
        ]}
      >
        <p>You choose who follows you and who sees each session you share.</p>
      </Feature>

      <GetTheApp next={{ to: "/pro", label: "Next: Pro" }} />
    </SiteLayout>
  );
}
