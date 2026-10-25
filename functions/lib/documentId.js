"use strict";

/**
 * Whether a client-sent value can name one Firestore document.
 *
 * A callable that puts a client's id into `.doc(id)` must check it first:
 * a "/" makes it a path to some other document, deeper in the tree, and
 * the Admin SDK's complaint about a bad one ("Value for argument
 * documentPath must point to a document") is not a sentence for anyone.
 * Firestore also refuses ".", "..", an id over 1,500 bytes and the
 * reserved `__name__` form.
 */
function isDocumentId(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value === value.trim() &&
    value !== "." &&
    value !== ".." &&
    !value.includes("/") &&
    !/^__.*__$/.test(value) &&
    Buffer.byteLength(value, "utf8") <= 1500
  );
}

module.exports = { isDocumentId };
