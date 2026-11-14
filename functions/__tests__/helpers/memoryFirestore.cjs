// Deterministic Firestore test double with real path/query/transaction effects.
// It deliberately does not emulate indexes or contention; emulator tests cover
// those. Failure injection happens before an atomic batch/transaction commits.
function memoryFirestore(seed = {}) {
  const data = new Map(Object.entries(seed));
  const operations = [];
  const failures = new Map();
  let autoIds = 0;
  let lastReadMs = 0;
  function check(path, operation) {
    const key = `${operation}:${path}`;
    if (failures.has(key)) throw failures.get(key);
  }
  function apply(writes) {
    writes.forEach(([op, ref]) => check(ref.path, op));
    // A create of an existing document fails the whole commit, as in Firestore.
    writes.forEach(([op, ref]) => {
      if (op === "create" && data.has(ref.path))
        throw new Error(`Document already exists: ${ref.path}`);
    });
    for (const [op, ref, value, options] of writes) {
      operations.push([op, ref.path]);
      if (op === "delete") data.delete(ref.path);
      else if (op === "create") data.set(ref.path, structuredClone(value));
      else if (op === "update") {
        if (!data.has(ref.path))
          throw new Error(`Missing document: ${ref.path}`);
        const next = structuredClone(data.get(ref.path));
        for (const [field, v] of Object.entries(value)) {
          const keys = field.split(".");
          const last = keys.pop();
          if (isFieldDelete(v)) {
            // Deleting a field that is not there changes nothing, and
            // makes no parent for it, as Firestore's does.
            const parent = keys.reduce((obj, key) => obj?.[key], next);
            if (parent && typeof parent === "object") delete parent[last];
            continue;
          }
          const parent = keys.reduce((obj, key) => (obj[key] ||= {}), next);
          parent[last] = isIncrement(v)
            ? (Number(parent[last]) || 0) + v.__increment
            : v;
        }
        data.set(ref.path, next);
      } else {
        // An increment in a set adds to the stored number (merge) or to 0
        // (a fresh document), as Firestore's does.
        const merge = !!options?.merge;
        const before = merge ? data.get(ref.path) || {} : {};
        const next = merge ? { ...before } : {};
        for (const [field, v] of Object.entries(
          merge ? value : structuredClone(value)
        )) {
          if (isFieldDelete(v)) delete next[field];
          else
            next[field] = isIncrement(v)
              ? (Number(before[field]) || 0) + v.__increment
              : v;
        }
        data.set(ref.path, next);
      }
    }
  }
  function ref(path) {
    return {
      path,
      id: path.split("/").at(-1),
      get parent() {
        return collection(path.split("/").slice(0, -1).join("/"));
      },
      collection: (name) => collection(`${path}/${name}`),
      get: async () => {
        check(path, "get");
        return snapshot(path);
      },
      set: async (value, options) =>
        apply([["set", ref(path), value, options]]),
      update: async (value) => apply([["update", ref(path), value]]),
      delete: async () => apply([["delete", ref(path)]]),
    };
  }
  function snapshot(path) {
    return {
      id: path.split("/").at(-1),
      ref: ref(path),
      exists: data.has(path),
      data: () => structuredClone(data.get(path)),
    };
  }
  function collection(
    path,
    group = false,
    filters = [],
    cursor,
    cap = Infinity
  ) {
    const q = {
      path,
      id: path.split("/").at(-1),
      get parent() {
        return path.includes("/")
          ? ref(path.split("/").slice(0, -1).join("/"))
          : null;
      },
      // No id: an auto id, as Firestore's doc() mints one.
      doc: (id) =>
        ref(`${path}/${id ?? `auto${String(++autoIds).padStart(16, "0")}`}`),
      where: (field, op, value) =>
        collection(
          path,
          group,
          [
            ...filters,
            [typeof field === "string" ? field : "__name__", op, value],
          ],
          cursor,
          cap
        ),
      orderBy: () => q,
      select: () => q,
      limit: (n) => collection(path, group, filters, cursor, n),
      // A reference, a document snapshot (as Firestore takes) or a path.
      startAfter: (r) =>
        collection(path, group, filters, r.path || r.ref?.path || r, cap),
      // An aggregation, as Firestore's count(): the matching documents'
      // number, without them, and the time it was read. Each read is
      // later than the last, as Firestore's read times are.
      count: () => ({
        get: async () => {
          const result = await q.get();
          const readMs = (lastReadMs = Math.max(Date.now(), lastReadMs + 1));
          return {
            readTime: { toMillis: () => readMs },
            data: () => ({ count: result.size }),
          };
        },
      }),
      get: async () => {
        check(path, "query");
        const paths = [...data.keys()]
          .sort()
          .filter((key) => {
            const parts = key.split("/");
            if (
              group
                ? parts.at(-2) !== path
                : parts.slice(0, -1).join("/") !== path
            )
              return false;
            if (cursor && key <= cursor) return false;
            return filters.every(([field, op, expected]) => {
              const actual =
                field === "__name__"
                  ? group
                    ? key
                    : parts.at(-1)
                  : field.split(".").reduce((v, k) => v?.[k], data.get(key));
              if (op === "==") return actual === expected;
              if (op === "in") return expected.includes(actual);
              if (op === "array-contains")
                return Array.isArray(actual) && actual.includes(expected);
              if (op === ">=") return actual >= expected;
              if (op === "<=") return actual != null && actual <= expected;
              if (op === "<") return actual < expected;
              if (op === ">") return actual != null && actual > expected;
              throw new Error(`Unsupported query: ${op}`);
            });
          })
          .slice(0, cap);
        return {
          docs: paths.map(snapshot),
          size: paths.length,
          empty: paths.length === 0,
        };
      },
    };
    return q;
  }
  function transaction() {
    const writes = [];
    const tx = {
      get: (r) => r.get(),
      create: (r, value) => {
        writes.push(["create", r, value]);
        return tx;
      },
      set: (r, value, options) => {
        writes.push(["set", r, value, options]);
        return tx;
      },
      update: (r, value) => {
        writes.push(["update", r, value]);
        return tx;
      },
      delete: (r) => {
        writes.push(["delete", r]);
        return tx;
      },
      commit: async () => apply(writes),
    };
    return tx;
  }
  return {
    data,
    operations,
    failures,
    doc: ref,
    collection,
    collectionGroup: (name) => collection(name, true),
    batch: transaction,
    getAll: async (...refs) => Promise.all(refs.map((r) => r.get())),
    runTransaction: async (fn) => {
      const tx = transaction();
      const value = await fn(tx);
      await tx.commit();
      return value;
    },
    recursiveDelete: async (r) => {
      check(r.path, "recursiveDelete");
      const paths = [...data.keys()].filter(
        (path) => path === r.path || path.startsWith(`${r.path}/`)
      );
      apply(paths.map((path) => ["delete", ref(path)]));
    },
  };
}
// A stand-in for FieldValue.increment, for code that takes its FieldValue
// as an argument: `update` adds it to the stored number, as Firestore does.
function increment(n) {
  return { __increment: n };
}
function isIncrement(v) {
  return !!v && typeof v === "object" && typeof v.__increment === "number";
}
// A stand-in for FieldValue.delete(), for code that takes it as an argument:
// `update` (a dotted path reaches into a map) and a merging `set` remove the
// field, as Firestore does.
function fieldDelete() {
  return { __delete: true };
}
function isFieldDelete(v) {
  return !!v && typeof v === "object" && v.__delete === true;
}
module.exports = { memoryFirestore, increment, fieldDelete };
