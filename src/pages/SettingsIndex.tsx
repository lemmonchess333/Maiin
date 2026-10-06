/**
 * SettingsIndex — top-level Settings page (Set1.1).
 *
 * iOS-style nested-page IA: the top page only navigates. You sit at the
 * top (photo, name, email; the photo changes in place, the rest opens your
 * profile), then the sections in three groups. Each row routes to a
 * dedicated sub-page through `SettingsSection`.
 *
 * Grouped because Set1 grouped it: fifteen identical rows in one card was
 * drift, and it read as a list to search rather than a place to look. Lift
 * plan and Run plan are not rows here: Programme opens on where each part
 * is set, and Train opens each editor directly.
 * Recently deleted meals and the exports moved into one "Your data" page,
 * the Data & Storage section Set1 and Home2/Food6 put them in.
 */
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ChevronRight,
  Target,
  Apple,
  Dumbbell,
  Palette,
  Lock,
  Footprints,
  Bell,
  HeartPulse,
  Crown,
  HelpCircle,
  Settings as Cog,
  Database,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useSubscription } from "@/lib/subscription";
import PageShell from "@/components/ui/PageShell";
import { pageItemVariant } from "@/components/ui/pageMotion";
import SettingsAvatar from "@/components/settings/SettingsAvatar";
import SettingsOfflineBanner from "@/components/settings/SettingsOfflineBanner";
import { SettingsGroup, SettingsRow } from "@/components/settings/SettingsList";
import { haptic } from "@/lib/haptic";
import { isRemotePushOffered } from "@/lib/pushNotifications";

declare const __APP_VERSION__: string;

interface SectionRow {
  /** Slug-route segment under /settings. */
  slug: string;
  label: string;
  description: string;
  /** The description where the app offers no remote push (the native
   *  app: see isRemotePushOffered), for a row whose description names
   *  push. */
  descriptionWithoutPush?: string;
  icon: LucideIcon;
  /** Icon colour for a row that belongs to a sport or to food. */
  tint?: string;
  /** Historical migration flag — every section is now migrated
   *  (all true). Kept so any future un-nested section is forced to
   *  make an explicit routing decision rather than silently 404ing. */
  migrated: boolean;
}

interface SectionGroup {
  title: string;
  rows: SectionRow[];
}

/** Section catalogue, grouped: what you train and eat, how the app
 *  behaves, then the account. Profile is the card above the groups. */
const GROUPS: SectionGroup[] = [
  {
    title: "Your plan",
    rows: [
      {
        slug: "training",
        label: "Programme",
        description: "Lift plan, run plan, reset",
        icon: Target,
        tint: "text-lifting",
        migrated: true,
      },
      {
        slug: "nutrition",
        label: "Nutrition",
        description: "Calorie target, goal weight",
        icon: Apple,
        tint: "text-nutrition",
        migrated: true,
      },
      {
        slug: "workout-prefs",
        label: "Workouts",
        description: "Rest timer, audio cues",
        icon: Dumbbell,
        migrated: true,
      },
      {
        slug: "shoes",
        label: "Shoes",
        description: "Mileage per pair",
        icon: Footprints,
        migrated: true,
      },
    ],
  },
  {
    title: "App",
    rows: [
      {
        slug: "notifications",
        label: "Notifications",
        description: "Reminders, push, activity",
        descriptionWithoutPush: "Reminders, activity",
        icon: Bell,
        migrated: true,
      },
      {
        slug: "units-appearance",
        label: "Units & appearance",
        description: "kg or lb, km or mi, theme",
        icon: Palette,
        migrated: true,
      },
      {
        slug: "privacy",
        label: "Social & privacy",
        description: "Sharing, route privacy, blocks",
        icon: Lock,
        migrated: true,
      },
      {
        slug: "health",
        label: "Apple Health",
        description: "Daily step count on Home",
        icon: HeartPulse,
        migrated: true,
      },
    ],
  },
  {
    title: "Account",
    rows: [
      {
        slug: "subscription",
        label: "Subscription",
        description: "Plan, billing, restore",
        icon: Crown,
        migrated: true,
      },
      {
        slug: "account",
        label: "Account",
        description: "Email, password, sign out",
        icon: Cog,
        migrated: true,
      },
      {
        slug: "data",
        label: "Your data",
        description: "Export, recently deleted",
        icon: Database,
        migrated: true,
      },
      {
        slug: "support-legal",
        label: "Help & legal",
        description: "Support, privacy, terms",
        icon: HelpCircle,
        migrated: true,
      },
    ],
  },
];

export default function SettingsIndex() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { isInTrial, trialDaysLeft, tier } = useSubscription();
  // The native app has no push switch, so no row there says "push".
  const pushOffered = isRemotePushOffered();

  const plan =
    tier === "pro" ? (
      "Pro"
    ) : isInTrial ? (
      <>
        Trial · <span className="font-mono tabular-nums">{trialDaysLeft}</span>{" "}
        {trialDaysLeft === 1 ? "day" : "days"} left
      </>
    ) : (
      "Free"
    );

  return (
    <PageShell title="Settings" banner={<SettingsOfflineBanner />}>
      {/* You. The photo is its own button (it opens the photo sheet);
          the rest of the card is a sibling button that opens Profile —
          a button cannot sit inside a button. */}
      <motion.div
        variants={pageItemVariant}
        className="rounded-xl bg-card flex flex-wrap items-center gap-x-3 pl-3"
      >
        {profile ? <SettingsAvatar profile={profile} /> : null}
        <button
          type="button"
          onClick={() => {
            haptic();
            navigate("/settings/profile");
          }}
          className="flex-1 min-w-[min(100%,9em)] min-h-[80px] pr-4 py-3 flex items-center gap-3 text-left rounded-r-xl hover:bg-muted/30 motion-safe:transition-colors"
        >
          {/* Two lines each before they cut, and under the photo when
              9em will not fit beside it: at larger text one line beside
              the photo read "E2…" and "e2e-…". */}
          <span className="flex-1 min-w-0">
            <span className="block text-body font-bold text-foreground line-clamp-2 break-words">
              {profile?.displayName || "Your profile"}
            </span>
            <span className="block text-xs text-muted-foreground line-clamp-2 [overflow-wrap:anywhere]">
              {user?.email ?? "Name, photo, body metrics"}
            </span>
          </span>
          <ChevronRight
            className="size-4 text-muted-foreground shrink-0"
            aria-hidden="true"
          />
        </button>
      </motion.div>

      {GROUPS.map((group) => (
        <motion.div key={group.title} variants={pageItemVariant}>
          <SettingsGroup title={group.title}>
            {group.rows.map((row) => (
              <SettingsRow
                key={row.slug}
                label={row.label}
                description={
                  (!pushOffered && row.descriptionWithoutPush) ||
                  row.description
                }
                icon={row.icon}
                iconClassName={row.tint}
                value={row.slug === "subscription" ? plan : undefined}
                onClick={() => navigate(`/settings/${row.slug}`)}
              />
            ))}
          </SettingsGroup>
        </motion.div>
      ))}

      <p className="text-center text-xs text-muted-foreground pt-2 pb-8">
        Tropos {__APP_VERSION__}
      </p>
    </PageShell>
  );
}
