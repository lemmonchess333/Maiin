import AppScreen from "@/website/site/AppScreen";
import FactRow from "@/website/site/FactRow";
import FeatureCards from "@/website/site/FeatureCards";
import FeatureSection from "@/website/site/FeatureSection";
import GetTheApp from "@/website/site/GetTheApp";
import PageHero from "@/website/site/PageHero";
import { SCREENS } from "@/website/site/screens";
import SiteLayout from "@/website/site/SiteLayout";

/** The Running page: tracking, race plans, paces, segments and privacy. */
export default function RunningPage() {
  return (
    <SiteLayout current="/running">
      <PageHero
        domain="running"
        kicker="Running"
        heading="Runs and race plans that fit your week"
        line="GPS runs with pace, splits and a route map, and race plans from 5K to 100K, built back from race day."
        picture={<AppScreen screen={SCREENS.run} eager />}
      />

      <FactRow
        label="Running in numbers"
        facts={[
          { figure: "5K to 100K", label: "race plans, road and trail" },
          { figure: "4", label: "kinds of run: easy, tempo, intervals, long" },
          { figure: "200 m", label: "hidden at each end of a run you share" },
          { figure: "400 m", label: "the shortest segment you can make" },
        ]}
      />

      <FeatureSection
        heading="Every run, mapped"
        picture={<AppScreen screen={SCREENS.runBest} />}
      >
        <p>
          Pace, splits, elevation and a route map coloured by pace. Easy runs,
          tempo runs, intervals and long runs, with spoken splits and pace
          alerts while you run.
        </p>
        <p>
          A new best gets the whole screen when you finish, and says by how
          much.
        </p>
      </FeatureSection>

      <FeatureSection
        heading="Race plans built back from race day"
        flip
        picture={<AppScreen screen={SCREENS.racePlan} />}
      >
        <p>
          Choose a race from the directory or enter your own date. The plan
          counts back from race day through base, build and taper, around the
          days you lift. Add the race’s total climb and a hilly race gets a
          trail plan: long runs in time, hill work, run by effort.
        </p>
        <p>
          5K and 10K plans are free. Plans for a half marathon or longer are
          part of Pro after their first week.
        </p>
      </FeatureSection>

      <FeatureCards
        id="around-your-week"
        heading="Around the rest of your week"
        cards={[
          {
            heading: "When you need an easier week",
            body: "Adjust this week when you’re not feeling 100%, your week is crowded or you need easier running. Your race date stays put.",
          },
          {
            heading: "Paces from your own times",
            body: "A recent race time at setup sets your training paces. With Pro they get faster as your runs show you’re fitter. Progress predicts your race times, and each pair of shoes keeps its mileage.",
          },
          {
            heading: "Segments with the people you follow",
            body: "Make a segment from a stretch of one of your runs, from 400 m up. Every run you save after that is timed on it, and its board shows your best beside the people you follow. There’s no board of everyone.",
          },
          {
            heading: "Hide where your runs start",
            body: "The first and last 200 m of a run you share are hidden from your followers unless you turn that off. Draw privacy zones around places you save, and a route that starts or ends near one is hidden there too.",
          },
        ]}
      />

      <GetTheApp
        heading="Plan your next race"
        line="Pick a race or a date in setup, and Tropos plans the weeks up to it around your lifting."
      />
    </SiteLayout>
  );
}
