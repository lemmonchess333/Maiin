/* What blocking someone does, said once for every Block dialog.
 *
 * The rules and callables refuse a follow, a follow request, props,
 * reactions, comments and a partner bond between the two accounts, and
 * hide followers-only posts across a block. The feeds drop the blocked
 * person's posts for the one who blocked. A public post stays readable by
 * anyone signed in, so the copy does not promise they can't see you. */
export const BLOCK_DIALOG_DESCRIPTION =
  "They won't be able to follow you, give props or comment, and you won't see their posts. Posts you share publicly stay public.";
