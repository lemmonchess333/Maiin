/**
 * Race-template ids — the server-side mirror of the race-TYPE entries in
 * `RUN_TEMPLATES` (src/lib/workoutTemplates.ts).
 *
 * WHY THIS FILE EXISTS. `raceDayCompletion.js` asked
 * `savedRun.actualTemplateId !== "race"`, which is never true: RunSummary
 * writes a template ID, and the race ids are `5k_race` … `marathon_race`.
 * So the server read EVERY completed race as a no-show, and the post-race
 * recovery entry never fired. The trap is documented in three separate
 * client modules and locked in CLAUDE.md — "detection is by template TYPE,
 * never `templateId === 'race'`" — and the server had no way to ask about
 * type, because it cannot import RUN_TEMPLATES.
 *
 * Its golden fixtures hid it: the ACCEPT case used `actualTemplateId:
 * "race"` while the REJECT cases used real ids (`easy_30`, `tempo_20`).
 * Rejections were therefore tested against production-shaped values and
 * acceptance against a value production never writes — the ADR-0008
 * failure `raceDayCompletion.js`'s own header describes and claims to have
 * fixed. The field name was corrected there (`templateId` →
 * `actualTemplateId`); the impossible VALUE survived the correction.
 *
 * TESTED-COPY RULE (same terms as `spaceIds.js`): this list is pinned
 * set-equal to `RUN_TEMPLATES.filter(t => t.type === "race")` by
 * `src/lib/__tests__/raceTemplateIds.cross.test.ts`. Adding a race
 * template touches both files or CI fails — which is the only thing that
 * keeps a server-side id list honest as the catalogue grows.
 */
const RACE_TEMPLATE_IDS = Object.freeze([
  "5k_race",
  "10k_race",
  "half_race",
  "marathon_race",
]);

/**
 * Is this template id a race?
 *
 * Takes the id rather than the whole doc so the caller stays explicit
 * about WHICH field it is asking about — `actualTemplateId` (what was
 * run) and `plannedTemplateId` (what was scheduled) are different
 * questions and the doc carries both.
 */
function isRaceTemplateId(templateId) {
  return (
    typeof templateId === "string" && RACE_TEMPLATE_IDS.includes(templateId)
  );
}

module.exports = { RACE_TEMPLATE_IDS, isRaceTemplateId };
