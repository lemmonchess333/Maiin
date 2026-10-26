import { spaceDef } from "@/features/spaces/spaceDefs";
import type { SuggestedPerson } from "@/lib/socialApi";

/** Why someone is suggested, in the same words wherever suggestions show
 *  (People search, the feed's People to follow row), or null when there is
 *  no reason to give and no line is drawn. Someone suggested for posting
 *  recently is null: every suggestion outside your Spaces is one, so a
 *  line saying so under each name says nothing. */
export function suggestionReason(person: SuggestedPerson): string | null {
  return person.reason === "shared_space" && person.sharedSpaceId
    ? `Also in ${spaceDef(person.sharedSpaceId)?.name ?? "a space you joined"}`
    : null;
}
