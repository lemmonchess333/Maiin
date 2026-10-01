import { spaceDef } from "@/features/spaces/spaceDefs";
import type { SuggestedPerson } from "@/lib/socialApi";

/** Why someone is suggested, in the same words wherever suggestions show
 *  (People search, the feed's People to follow row). */
export function suggestionReason(person: SuggestedPerson): string {
  return person.reason === "shared_space" && person.sharedSpaceId
    ? `Also in ${spaceDef(person.sharedSpaceId)?.name ?? "a space you joined"}`
    : "Recent post";
}
