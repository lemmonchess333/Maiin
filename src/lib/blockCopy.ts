/* What blocking someone does, said once for every Block dialog.
 *
 * A block hides each person from the other (S4, Polish3 call 1). The rules
 * and callables refuse a follow, a follow request, props, reactions,
 * comments and a partner bond between the two accounts, and refuse a
 * single read of the blocker's profile or of either's post. The app of
 * each leaves the other out of the feed, Explore, Spaces, comments, props,
 * boards and search, from `useBlockedUsers`, which holds both directions:
 * the person blocked learns of the block from the server's copy
 * (`blockedBy`). Their app shows the blocker's profile as not available,
 * in the words it uses for a deleted account, and nothing sends them a
 * notice, so they are not told. */
export const BLOCK_DIALOG_DESCRIPTION =
  "They won't see your posts or profile, and you won't see theirs. They won't be told.";
