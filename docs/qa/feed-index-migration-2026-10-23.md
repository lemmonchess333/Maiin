# Routing-only Following feed migration

Historical `feeds/{recipient}/items/{id}` documents contain names, avatars,
session summaries and highlights. Their owner could fetch those details after
a block, unfollow or a post becoming private, although reading the parent
activity was refused. UI filtering did not protect the copied data.

New feed documents have `schemaVersion: 2` and only `activityId`, `authorId`,
`createdAt` and `expiresAt`. `authorId` remains a routing key for the existing
account-deletion sweep and unread badge suppression. The Following hook reads
every display field from the parent activity under its current access rules.

The read rule immediately refuses historical documents, independently of the
scrub. Both feed queries and the unread listener constrain `schemaVersion == 2`;
this preserves list pagination without per-parent rule reads and their access
call limit. The new `items(schemaVersion, createdAt desc)` index supports both.

## Release sequence

1. Deploy the new fanout source, composite index and read rule through the
   normal production workflow. Verify the deployed fanout source and that the
   index is ready. Do not weaken the read rule while old documents remain.
2. Release the updated web/native client. Older builds issue an unconstrained
   feed query and receive permission denied; they need an update/refresh.
   Until the scrub runs, the updated feed shows new v2 posts only. It can be
   empty for someone whose posts are all historical. Logging and the original
   activity documents are unaffected.
3. Using Firestore Admin credentials for the explicitly selected project,
   review the dry run, then run the scrub:

   ```sh
   node functions/scripts/scrubLegacyFeedItems.js --project PROJECT_ID
   node functions/scripts/scrubLegacyFeedItems.js --project PROJECT_ID --apply
   ```

   The default is read-only. The script scans `items` in pages of 200, filters
   exact feed paths, and **replaces** each historical copy with the allowed
   fields. It preserves the original order, routing key and expiry (deriving
   expiry from the original creation time if absent), including old auto-id
   copies. Notifications/comments are untouched. Malformed secondary indexes
   and copies for deleting accounts are removed; source activities are never
   modified. Each rewrite re-reads the row and account-deletion freezes inside
   a transaction, so a concurrent delete cannot be resurrected.

4. The script prints a checkpoint after each completed page. For bounded
   batches use `--max-pages 10`; resume with `--after FULL_DOCUMENT_PATH` from
   that checkpoint. Restarting without a checkpoint is also safe. Rerun the
   dry run until `candidates` is zero. No migration has been run as part of
   preparing this change.

The backend change protects server reads of historical details before and
during the scrub. It cannot retract data someone already downloaded or saved.
