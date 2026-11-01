"use strict";

/**
 * What the word filter reads on a feed post (onActivityCreated).
 *
 * A post is written by the client straight to `activities/{id}`, and the
 * rules bound only each field's size, so every piece of text the feed
 * card shows a follower must pass the filter here, before the post fans
 * out. A post that trips it is flagged and made private, so its author
 * still sees it and nobody else does.
 *
 * The card (src/components/social/ActivityCard.tsx) shows the author's
 * name, the title (activityTitle, else workoutName, else runName), the
 * caption, the PR, challenge and badge lines, a pace stored as text, each
 * exercise row's name and the summary an older row carries, and each
 * movement label, which is a muscle group's own text when the app does
 * not know it.
 *
 * A post past ACTIVITY_MAX_BYTES is held the same way. The rules bound
 * each field the app writes, but not the maps inside a list (a route's
 * points, a lift's exercise rows), so a post near Firestore's 1 MiB limit
 * can still be written, and everyone who opens Explore downloads it. The
 * largest post the app writes is a few kilobytes.
 */

const profanityFilter = require("../profanityFilter");
const { storedSize } = require("./storedSize");

/** The most a post may weigh and still reach anyone else. Fifty exercise
 *  rows, a hundred route points and every text field at its cap come to
 *  under a third of it. */
const ACTIVITY_MAX_BYTES = 64 * 1024;

/** What `flaggedActivityField` names for a post past that size. */
const OVERSIZED = "size";

/** The post's own text fields, in the order a reader meets them. */
const ACTIVITY_TEXT_FIELDS = Object.freeze([
  "authorName",
  "activityTitle",
  "workoutName",
  "runName",
  "caption",
  "prExercise",
  "challengeMilestone",
  "badgeEarned",
  // A number on every post the app writes now; older posts hold "5:34".
  "avgPace",
]);

/** The text each exercise row shows: its name, and the summary a row
 *  without figures draws as written. */
function exerciseTexts(exercises) {
  if (!Array.isArray(exercises)) return [];
  const texts = [];
  for (const row of exercises) {
    if (typeof row === "string") texts.push(row);
    else if (row && typeof row === "object") {
      if (typeof row.name === "string") texts.push(row.name);
      if (typeof row.summary === "string") texts.push(row.summary);
    }
  }
  return texts;
}

/** The movement labels, as the card spells an unknown key: its words
 *  split at the underscores. */
function muscleTexts(muscleGroups) {
  if (!Array.isArray(muscleGroups)) return [];
  return muscleGroups
    .filter((group) => typeof group === "string")
    .map((group) => group.replace(/_/g, " "));
}

/**
 * The first field whose text the filter refuses, or null for a post it
 * passes. A list field is named whole ("exercises", "muscleGroups").
 */
function objectionableActivityField(data) {
  if (!data || typeof data !== "object") return null;
  const field = profanityFilter.findProfaneField(data, ACTIVITY_TEXT_FIELDS);
  if (field) return field;
  if (exerciseTexts(data.exercises).some(profanityFilter.containsProfanity)) {
    return "exercises";
  }
  if (muscleTexts(data.muscleGroups).some(profanityFilter.containsProfanity)) {
    return "muscleGroups";
  }
  return null;
}

/**
 * Why a new post is held from everyone but its author: "size" for one past
 * ACTIVITY_MAX_BYTES, else the field the word filter refuses, else null.
 */
function flaggedActivityField(data) {
  if (storedSize(data) > ACTIVITY_MAX_BYTES) return OVERSIZED;
  return objectionableActivityField(data);
}

module.exports = {
  ACTIVITY_MAX_BYTES,
  ACTIVITY_TEXT_FIELDS,
  OVERSIZED,
  flaggedActivityField,
  objectionableActivityField,
};
