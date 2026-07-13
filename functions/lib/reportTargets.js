"use strict";

/**
 * Moderation report target resolver (packet 14).
 *
 * A report is USER EVIDENCE — it must never itself be the authority to act on
 * a user or document. This module:
 *   - normalizes + validates a client-supplied create payload (rejecting any
 *     forgeable field like reporterId / targetUid / status / metadata), and
 *   - resolves a report target's canonical author/uid + preview by READING the
 *     current target document server-side, so a moderation action is always
 *     taken against a freshly-resolved target, not attacker-controlled stored
 *     fields.
 *
 * Firestore + reader handles are injected so the same code serves creation /
 * queue (plain DocumentReference#get) and resolution (transaction.get(ref) —
 * all reads before the transaction's writes).
 */

const TARGET_TYPES = Object.freeze([
  "activity",
  "comment",
  "user",
  "space_post",
]);

const REPORT_CATEGORIES = Object.freeze([
  "harassment",
  "spam",
  "inappropriate",
  "impersonation",
  "other",
]);

const ALLOWED_CREATE_KEYS = new Set([
  "targetType",
  "targetId",
  "category",
  "subReason",
  "freeformNote",
  "hideFromFeed",
  "blockAuthor",
]);

class ReportTargetError extends Error {
  constructor(code) {
    super(code);
    this.name = "ReportTargetError";
    this.code = code;
  }
}

function fail(code) {
  throw new ReportTargetError(code);
}

function isReportTargetError(error) {
  return error instanceof ReportTargetError;
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertDocumentId(value) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value !== value.trim() ||
    value === "." ||
    value === ".." ||
    value.includes("/") ||
    Buffer.byteLength(value, "utf8") > 1500
  ) {
    fail("invalid-report-target");
  }
  return value;
}

function parseScopedTargetId(value) {
  if (typeof value !== "string" || value !== value.trim()) {
    fail("invalid-report-target");
  }
  const parts = value.split(":");
  if (parts.length !== 2) fail("invalid-report-target");
  return {
    targetId: value,
    scopeId: assertDocumentId(parts[0]),
    documentId: assertDocumentId(parts[1]),
  };
}

function normalizeTarget(targetType, targetId) {
  if (!TARGET_TYPES.includes(targetType)) fail("invalid-report-target");

  if (targetType === "activity") {
    const activityId = assertDocumentId(targetId);
    return { targetType, targetId: activityId, activityId };
  }

  if (targetType === "user") {
    const uid = assertDocumentId(targetId);
    return { targetType, targetId: uid, uid };
  }

  const scoped = parseScopedTargetId(targetId);
  if (targetType === "comment") {
    return {
      targetType,
      targetId: scoped.targetId,
      activityId: scoped.scopeId,
      commentId: scoped.documentId,
    };
  }

  return {
    targetType,
    targetId: scoped.targetId,
    spaceId: scoped.scopeId,
    postId: scoped.documentId,
  };
}

function optionalText(value, maxLength) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") fail("invalid-report-payload");
  const normalized = value.trim();
  if (!normalized) return undefined;
  if (normalized.length > maxLength) fail("invalid-report-payload");
  return normalized;
}

function optionalBoolean(value) {
  if (value === undefined) return false;
  if (typeof value !== "boolean") fail("invalid-report-payload");
  return value;
}

function normalizeCreateReportInput(data) {
  if (!isPlainObject(data)) fail("invalid-report-payload");
  for (const key of Object.keys(data)) {
    if (!ALLOWED_CREATE_KEYS.has(key)) fail("invalid-report-payload");
  }

  const target = normalizeTarget(data.targetType, data.targetId);
  if (
    typeof data.category !== "string" ||
    !REPORT_CATEGORIES.includes(data.category)
  ) {
    fail("invalid-report-payload");
  }

  const subReason = optionalText(data.subReason, 160);
  const freeformNote = optionalText(data.freeformNote, 500);
  // Preserve the existing category→reason mapping: impersonation is stored as
  // reason "other" for the legacy queue taxonomy.
  const reason = data.category === "impersonation" ? "other" : data.category;

  return {
    targetType: target.targetType,
    targetId: target.targetId,
    category: data.category,
    reason,
    ...(subReason ? { subReason } : {}),
    ...(freeformNote ? { freeformNote } : {}),
    hideFromFeed: optionalBoolean(data.hideFromFeed),
    blockAuthor: optionalBoolean(data.blockAuthor),
  };
}

function targetUid(value) {
  try {
    return assertDocumentId(value);
  } catch (_) {
    fail("report-target-unavailable");
  }
}

function previewString(value) {
  return typeof value === "string" ? value : null;
}

async function readSnapshot(reader, ref) {
  // Admin Firestore reads through DocumentReference#get(); a transaction
  // supplies transaction.get(ref). Keeping the distinction here lets
  // createReport / listPendingReports and resolveReport share one helper.
  if (reader === undefined) return ref.get();
  return reader.get(ref);
}

async function readExisting(reader, ref) {
  const snapshot = await readSnapshot(reader, ref);
  if (!snapshot.exists) fail("report-target-unavailable");
  return snapshot.data() || {};
}

async function assertReporterCanSeeActivity({
  firestore,
  reader,
  activity,
  reporterUid,
}) {
  // Omitted only by the admin queue/action path. A normal report creation
  // must not turn an enumerable activity id into a private-content oracle.
  if (reporterUid === undefined) return;

  const uid = assertDocumentId(reporterUid);
  const authorId = targetUid(activity.authorId);
  if (authorId === uid || activity.visibility === "public") return;
  if (activity.visibility !== "followers") {
    fail("report-target-unavailable");
  }

  const followerRef = firestore.doc(
    "followers/" + authorId + "/users/" + uid
  );
  const followerSnap = await readSnapshot(reader, followerRef);
  if (!followerSnap.exists) fail("report-target-unavailable");
}

async function resolveReportTarget({
  firestore,
  reader,
  reporterUid,
  targetType,
  targetId,
}) {
  if (!firestore || typeof firestore.doc !== "function") {
    throw new TypeError("firestore is required");
  }
  if (reader !== undefined && (!reader || typeof reader.get !== "function")) {
    throw new TypeError("reader.get is required");
  }

  const target = normalizeTarget(targetType, targetId);

  if (target.targetType === "activity") {
    const ref = firestore.doc("activities/" + target.activityId);
    const data = await readExisting(reader, ref);
    await assertReporterCanSeeActivity({
      firestore,
      reader,
      activity: data,
      reporterUid,
    });
    const uid = targetUid(data.authorId);
    return {
      targetType: target.targetType,
      targetId: target.targetId,
      targetUid: uid,
      targetRef: ref,
      preview: {
        authorId: uid,
        authorName: previewString(data.authorName),
        type: previewString(data.type),
        caption: previewString(data.caption),
        workoutName: previewString(data.workoutName),
        runName: previewString(data.runName),
        visibility: previewString(data.visibility),
        flagged: data.flagged === true,
      },
    };
  }

  if (target.targetType === "comment") {
    const ref = firestore.doc(
      "comments/" + target.activityId + "/items/" + target.commentId
    );
    const data = await readExisting(reader, ref);
    const activity = await readExisting(
      reader,
      firestore.doc("activities/" + target.activityId)
    );
    await assertReporterCanSeeActivity({
      firestore,
      reader,
      activity,
      reporterUid,
    });
    const uid = targetUid(data.authorId);
    return {
      targetType: target.targetType,
      targetId: target.targetId,
      targetUid: uid,
      targetRef: ref,
      preview: {
        authorId: uid,
        authorName: previewString(data.authorName),
        text: previewString(data.text),
        activityId: target.activityId,
      },
    };
  }

  if (target.targetType === "user") {
    const ref = firestore.doc("users/" + target.uid + "/public/profile");
    const data = await readExisting(reader, ref);
    return {
      targetType: target.targetType,
      targetId: target.targetId,
      targetUid: target.uid,
      targetRef: ref,
      preview: {
        uid: target.uid,
        displayName: previewString(data.displayName),
      },
    };
  }

  const ref = firestore.doc(
    "spaces/" + target.spaceId + "/posts/" + target.postId
  );
  const data = await readExisting(reader, ref);
  const uid = targetUid(data.authorId);
  return {
    targetType: target.targetType,
    targetId: target.targetId,
    targetUid: uid,
    targetRef: ref,
    preview: {
      authorId: uid,
      authorName: previewString(data.authorName),
      title: previewString(data.title),
      body: previewString(data.body),
      spaceId: target.spaceId,
    },
  };
}

module.exports = {
  TARGET_TYPES,
  REPORT_CATEGORIES,
  ReportTargetError,
  isReportTargetError,
  normalizeCreateReportInput,
  resolveReportTarget,
};
