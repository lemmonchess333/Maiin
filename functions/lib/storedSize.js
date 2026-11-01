"use strict";

/**
 * About how many bytes Firestore stores for a document's data, by its
 * published size rules: a string is its UTF-8 bytes plus one, a number or
 * a timestamp 8, a boolean or null 1, a geopoint 16, bytes their length, a
 * reference its path, a list the sum of its items, and a map the sum of
 * its keys (sized as strings) and values.
 *
 * The rules can bound a post's own fields but not the maps inside a list
 * (a route's points, a lift's exercise rows), so a client can still write
 * a post near Firestore's 1 MiB limit that every reader of a feed or a
 * Space then downloads. The post triggers measure a new post with this
 * and keep an oversized one from anyone else.
 *
 * Stops past the depth Firestore allows (20 levels of maps and lists), so
 * any stored document is walked whole and a value that is not plain data
 * cannot loop it.
 */
const MAX_DEPTH = 32;

function storedSize(value, depth = 0) {
  if (value === null || value === undefined) return 1;
  switch (typeof value) {
    case "boolean":
      return 1;
    case "number":
    case "bigint":
      return 8;
    case "string":
      return Buffer.byteLength(value, "utf8") + 1;
    case "object":
      break;
    default:
      return 0;
  }
  if (depth >= MAX_DEPTH) return 0;
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return value.length;
  }
  if (Array.isArray(value)) {
    let size = 0;
    for (const item of value) size += storedSize(item, depth + 1);
    return size;
  }
  // A map. Checked before the special types below, whose fields a map
  // could imitate (a "path" key, say) to be measured as something small.
  const proto = Object.getPrototypeOf(value);
  if (proto === Object.prototype || proto === null) {
    let size = 0;
    for (const key of Object.keys(value)) {
      size += Buffer.byteLength(key, "utf8") + 1;
      size += storedSize(value[key], depth + 1);
    }
    return size;
  }
  // A Timestamp.
  if (typeof value.toMillis === "function") return 8;
  // A vector: its numbers.
  if (typeof value.toArray === "function") return value.toArray().length * 8;
  // A DocumentReference: its path, never the client it carries.
  if (typeof value.path === "string") {
    return Buffer.byteLength(value.path, "utf8") + 1;
  }
  // A GeoPoint, and anything else Firestore hands back.
  return 16;
}

module.exports = { storedSize };
