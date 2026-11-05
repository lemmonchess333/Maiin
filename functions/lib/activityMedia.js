"use strict";

// The gateway treats a stored activity media URL only as an identifier.
// Reader-first rollout still permits legacy direct reads and tokenized uploads.
// The upload helper below is reserved for the later cutover: index.js exports
// only read endpoints, so that helper is not remotely invokable in this stage.
const { randomUUID } = require("node:crypto");
const { transactionAccountsLive } = require("./deletionTransactionGuard");
const { safeSearch, refusesPhoto } = require("./photoScreen");
const BUCKETS = new Set([
  "adaptive-fitness-af8bb.firebasestorage.app",
  "adaptive-fitness-af8bb.appspot.com",
]);
const LIMITS = { photo: 2 * 1024 * 1024, map: 512 * 1024 };
const segment = (s) =>
  typeof s === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(s);
function failure(code, reason) {
  const error = new Error(
    code === "permission-denied"
      ? "Media not accessible."
      : "Unable to process media."
  );
  error.code = code;
  if (reason) error.details = { reason };
  return error;
}
function validate(data, context, upload) {
  if (!context || !context.auth || !segment(context.auth.uid))
    throw failure("unauthenticated");
  if (
    !data ||
    !segment(data.activityId) ||
    !["photo", "map"].includes(data.kind) ||
    (data.kind === "photo"
      ? typeof data.id !== "string" || !/^[A-Za-z0-9_-]{8,64}$/.test(data.id)
      : !["light", "dark"].includes(data.id))
  ) {
    throw failure("invalid-argument");
  }
  if (upload && context.auth.token?.email_verified !== true)
    throw failure("permission-denied");
  return {
    activityId: data.activityId,
    kind: data.kind,
    id: data.id,
    uid: context.auth.uid,
  };
}
function mediaPath(authorId, request) {
  return `${request.kind === "photo" ? "post-photos" : "route-maps"}/${authorId}/${request.activityId}/${request.id}.jpg`;
}
function mediaUrl(bucket, path) {
  if (!BUCKETS.has(bucket)) throw failure("unavailable");
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(path)}`;
}
function namesMedia(url, path) {
  if (typeof url !== "string" || url.length > 2048) return false;
  // Exact canonical path only; a URL never supplies the fetch destination.
  return [...BUCKETS].some((bucket) => {
    const canonical = mediaUrl(bucket, path);
    return (
      url === canonical ||
      url.startsWith(canonical + "?") ||
      url.startsWith(canonical + "#")
    );
  });
}
async function authorize(db, request, upload, assertAdmin) {
  return db.runTransaction(async (tx) => {
    if (request.reportId) {
      // Only the dedicated admin handler can set reportId. A report's user-
      // supplied target is never authority to read somebody else's media.
      assertAdmin(request.uid);
      const report = await tx.get(
        db.collection("reports").doc(request.reportId)
      );
      const authority = await tx.get(
        db.collection("reportAuthority").doc(request.reportId)
      );
      const target = authority.exists ? authority.data() : null;
      if (
        !report.exists ||
        report.data()?.status !== "pending" ||
        !target ||
        target.version !== 1 ||
        target.targetType !== "activity" ||
        !segment(target.targetId)
      )
        throw failure("permission-denied");
      request = { ...request, activityId: target.targetId };
    }
    const snap = await tx.get(
      db.collection("activities").doc(request.activityId)
    );
    const activity = snap.exists ? snap.data() : null;
    if (!activity || !segment(activity.authorId))
      throw failure("permission-denied");
    const author = activity.authorId;
    if (
      !(await transactionAccountsLive({
        firestore: db,
        tx,
        uids: [request.uid, author],
      }))
    )
      throw failure("permission-denied");
    // Missing account documents are not live accounts, even after a tombstone expires.
    for (const uid of new Set([author, request.uid])) {
      if (!(await tx.get(db.collection("users").doc(uid))).exists)
        throw failure("permission-denied");
    }
    if (upload) {
      if (author !== request.uid) throw failure("permission-denied");
      if (
        activity.visibility !== "private" &&
        (await tx.get(db.collection("globalRestrictedUids").doc(author))).exists
      )
        throw failure("permission-denied");
    } else if (!request.reportId && author !== request.uid) {
      for (const [blocker, blocked] of [
        [author, request.uid],
        [request.uid, author],
      ]) {
        if (
          (
            await tx.get(
              db
                .collection("blocks")
                .doc(blocker)
                .collection("users")
                .doc(blocked)
            )
          ).exists
        )
          throw failure("permission-denied");
      }
      if (activity.visibility !== "public") {
        if (
          activity.visibility !== "followers" ||
          !(
            await tx.get(
              db
                .collection("followers")
                .doc(author)
                .collection("users")
                .doc(request.uid)
            )
          ).exists
        )
          throw failure("permission-denied");
      }
    }
    const path = mediaPath(author, request);
    if (
      request.kind === "map" &&
      (!Array.isArray(activity.routePreview) ||
        activity.routePreview.length < 2)
    )
      throw failure("permission-denied");
    if (!upload) {
      const named =
        request.kind === "map"
          ? namesMedia(activity.routeMap?.[request.id], path)
          : Array.isArray(activity.photos) &&
            activity.photos
              .slice(0, 4)
              .some(
                (photo) =>
                  photo?.id === request.id && namesMedia(photo.url, path)
              );
      if (!named) throw failure("permission-denied");
    }
    return path;
  });
}
function decodeJpeg(base64, limit) {
  if (
    typeof base64 !== "string" ||
    base64.length === 0 ||
    base64.length > Math.ceil(limit / 3) * 4 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      base64
    )
  )
    throw failure("invalid-argument");
  const bytes = Buffer.from(base64, "base64");
  if (
    bytes.length >= limit ||
    bytes.length < 4 ||
    bytes[0] !== 0xff ||
    bytes[1] !== 0xd8 ||
    bytes[bytes.length - 2] !== 0xff ||
    bytes[bytes.length - 1] !== 0xd9
  )
    throw failure("invalid-argument");
  return bytes;
}
async function boundedRead(file, limit) {
  const stream = file.createReadStream();
  const chunks = [];
  let size = 0;
  try {
    for await (const chunk of stream) {
      size += chunk.length;
      if (size >= limit) throw failure("permission-denied");
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  } finally {
    stream.destroy();
  }
}
function createActivityMediaHandlers({
  db,
  bucket,
  getAccessToken,
  screen = safeSearch,
  assertAdmin = () => {
    throw failure("permission-denied");
  },
}) {
  async function readAuthorized(request) {
    const path = await authorize(db, request, false, assertAdmin);
    try {
      const [metadata] = await bucket.file(path).getMetadata();
      const size = Number(metadata.size);
      if (
        !metadata.generation ||
        metadata.contentType !== "image/jpeg" ||
        !Number.isSafeInteger(size) ||
        size < 4 ||
        size >= LIMITS[request.kind]
      )
        throw failure("permission-denied");
      // Pin the generation so an overwrite cannot bypass the size/type check.
      const bytes = await boundedRead(
        bucket.file(path, { generation: metadata.generation }),
        LIMITS[request.kind]
      );
      if (bytes.length !== size) throw failure("permission-denied");
      const currentPath = await authorize(db, request, false, assertAdmin);
      if (currentPath !== path) throw failure("permission-denied");
      return { base64: bytes.toString("base64"), contentType: "image/jpeg" };
    } catch (error) {
      if (error.code === "permission-denied") throw error;
      // Missing objects and inaccessible posts have the same response.
      throw failure(error.code === 404 ? "permission-denied" : "unavailable");
    }
  }
  return {
    async read(data, context) {
      return readAuthorized(validate(data, context, false));
    },
    async readReported(data, context) {
      if (!data || !segment(data.reportId)) throw failure("invalid-argument");
      const request = validate(
        { activityId: "report", kind: "photo", id: data.id },
        context,
        false
      );
      return readAuthorized({ ...request, reportId: data.reportId });
    },
    async upload(data, context) {
      const request = validate(data, context, true);
      const bytes = decodeJpeg(data.base64, LIMITS[request.kind]);
      const path = await authorize(db, request, true);
      let annotation;
      try {
        annotation = await screen(bytes, await getAccessToken());
      } catch (_) {
        throw failure("unavailable");
      }
      if (refusesPhoto(annotation))
        throw failure("failed-precondition", "photo-refused");
      if (
        !annotation ||
        !["VERY_UNLIKELY", "UNLIKELY", "POSSIBLE"].includes(annotation.adult)
      )
        throw failure("unavailable");
      if ((await authorize(db, request, true)) !== path)
        throw failure("permission-denied");
      const url = mediaUrl(bucket.name, path);
      const file = bucket.file(path);
      let generation = 0;
      if (request.kind === "map") {
        try {
          const [metadata] = await file.getMetadata();
          if (!metadata.generation) throw failure("unavailable");
          generation = metadata.generation;
        } catch (error) {
          if (error.code !== 404) throw failure("unavailable");
        }
      }
      const uploadId = randomUUID();
      try {
        await file.save(bytes, {
          resumable: false,
          preconditionOpts: { ifGenerationMatch: generation },
          metadata: {
            contentType: "image/jpeg",
            cacheControl: "private, no-store, max-age=0",
            // Upload creates a new object generation with replacement metadata.
            // Explicit empty token value prevents retaining any legacy capability.
            metadata: {
              firebaseStorageDownloadTokens: "",
              activityMediaUploadId: uploadId,
            },
          },
        });
      } catch (error) {
        throw failure(error.code === 412 ? "aborted" : "unavailable");
      }
      try {
        if ((await authorize(db, request, true)) !== path)
          throw failure("permission-denied");
      } catch (error) {
        // Storage cannot join a Firestore transaction. Compensate if deletion or
        // restriction won during upload; never delete another writer's generation.
        try {
          const [metadata] = await file.getMetadata();
          if (metadata.metadata?.activityMediaUploadId === uploadId) {
            await bucket
              .file(path, { generation: metadata.generation })
              .delete({
                ignoreNotFound: true,
                ifGenerationMatch: metadata.generation,
              });
          }
        } catch (_) {
          throw failure("unavailable");
        }
        throw error;
      }
      return { url };
    },
  };
}
module.exports = { createActivityMediaHandlers, namesMedia, mediaUrl, LIMITS };
