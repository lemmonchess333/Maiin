import { Link } from "react-router-dom";
import SectionHeading from "@/components/ui/SectionHeading";
import BlockAwareAvatar from "@/components/social/BlockAwareAvatar";
import FollowButton from "@/components/social/FollowButton";
import { suggestionReason } from "@/components/social/suggestionReason";
import type { SuggestedPerson } from "@/lib/socialApi";
import { track as trackSocialEvent } from "@/lib/socialAnalytics";

/**
 * People to follow, inside the feed after its second post, as Strava and
 * Hevy place theirs: people in your Spaces first, then
 * recent posters. A followed person leaves the row; See all opens People.
 */
export default function PeopleToFollowRow({
  people,
  onFollowed,
  onSeeAll,
}: {
  people: SuggestedPerson[];
  onFollowed: (uid: string) => void;
  onSeeAll: () => void;
}) {
  if (people.length === 0) return null;
  return (
    <section aria-labelledby="people-to-follow" className="space-y-2 py-1">
      <SectionHeading
        id="people-to-follow"
        size="compact"
        action={
          <button
            type="button"
            onClick={onSeeAll}
            className="inline-flex min-h-[44px] items-center text-sm font-semibold text-lifting-strong hover:text-lifting-strong/80 transition-colors"
          >
            See all
          </button>
        }
      >
        People to follow
      </SectionHeading>
      <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 snap-x snap-mandatory">
        {people.map((person) => (
          <li
            key={person.uid}
            className="flex w-[148px] shrink-0 snap-start flex-col items-center gap-2 rounded-xl bg-card card-shadow p-3 text-center"
          >
            <Link
              to={`/user/${person.uid}`}
              className="flex w-full min-w-0 flex-col items-center gap-1"
            >
              <BlockAwareAvatar
                uid={person.uid}
                photoURL={person.photoURL}
                displayName={person.displayName}
                size="lg"
              />
              <span className="w-full truncate text-sm font-semibold text-foreground">
                {person.displayName}
              </span>
              <span className="line-clamp-2 min-h-8 text-xs leading-4 text-muted-foreground">
                {suggestionReason(person)}
              </span>
            </Link>
            <FollowButton
              targetUid={person.uid}
              className="mt-auto w-full text-sm"
              onFollowChange={(following) => {
                if (!following) return;
                trackSocialEvent("social_follow", {
                  followSource: "people_row",
                });
                onFollowed(person.uid);
              }}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
