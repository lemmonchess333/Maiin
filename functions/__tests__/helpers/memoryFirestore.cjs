// Deterministic Firestore test double with real path/query/transaction effects.
// It deliberately does not emulate indexes or contention; emulator tests cover
// those. Failure injection happens before an atomic batch/transaction commits.
function memoryFirestore(seed = {}) {
  const data = new Map(Object.entries(seed));
  const operations = [];
  const failures = new Map();
  function check(path, operation) {
    const key = `${operation}:${path}`;
    if (failures.has(key)) throw failures.get(key);
  }
  function apply(writes) {
    writes.forEach(([op, ref]) => check(ref.path, op));
    for (const [op, ref, value, options] of writes) {
      operations.push([op, ref.path]);
      if (op === "delete") data.delete(ref.path);
      else if (op === "update") {
        if (!data.has(ref.path)) throw new Error(`Missing document: ${ref.path}`);
        const next = structuredClone(data.get(ref.path));
        for (const [field, v] of Object.entries(value)) {
          const keys = field.split(".");
          const last = keys.pop();
          const parent = keys.reduce((obj, key) => obj[key] ||= {}, next);
          parent[last] = v;
        }
        data.set(ref.path, next);
      } else data.set(ref.path, options?.merge ? { ...data.get(ref.path), ...value } : structuredClone(value));
    }
  }
  function ref(path) {
    return { path, id: path.split("/").at(-1),
      get parent() { return collection(path.split("/").slice(0, -1).join("/")); },
      collection: (name) => collection(`${path}/${name}`),
      get: async () => { check(path, "get"); return snapshot(path); },
      set: async (value, options) => apply([["set", ref(path), value, options]]),
      update: async (value) => apply([["update", ref(path), value]]),
      delete: async () => apply([["delete", ref(path)]]),
    };
  }
  function snapshot(path) {
    return { id: path.split("/").at(-1), ref: ref(path), exists: data.has(path), data: () => structuredClone(data.get(path)) };
  }
  function collection(path, group = false, filters = [], cursor, cap = Infinity) {
    const q = { path, id: path.split("/").at(-1),
      get parent() { return path.includes("/") ? ref(path.split("/").slice(0, -1).join("/")) : null; },
      doc: (id) => ref(`${path}/${id}`),
      where: (field, op, value) => collection(path, group, [...filters, [typeof field === "string" ? field : "__name__", op, value]], cursor, cap),
      orderBy: () => q,
      select: () => q,
      limit: (n) => collection(path, group, filters, cursor, n),
      startAfter: (r) => collection(path, group, filters, r.path || r, cap),
      get: async () => {
        check(path, "query");
        const paths = [...data.keys()].sort().filter((key) => {
          const parts = key.split("/");
          if (group ? parts.at(-2) !== path : parts.slice(0, -1).join("/") !== path) return false;
          if (cursor && key <= cursor) return false;
          return filters.every(([field, op, expected]) => {
            const actual = field === "__name__" ? (group ? key : parts.at(-1)) : field.split(".").reduce((v, k) => v?.[k], data.get(key));
            if (op === "==") return actual === expected;
            if (op === "in") return expected.includes(actual);
            if (op === "array-contains") return Array.isArray(actual) && actual.includes(expected);
            if (op === ">=") return actual >= expected;
            if (op === "<=") return actual != null && actual <= expected;
            if (op === "<") return actual < expected;
            throw new Error(`Unsupported query: ${op}`);
          });
        }).slice(0, cap);
        return { docs: paths.map(snapshot), size: paths.length, empty: paths.length === 0 };
      },
    };
    return q;
  }
  function transaction() {
    const writes = [];
    const tx = { get: (r) => r.get(),
      set: (r, value, options) => { writes.push(["set", r, value, options]); return tx; },
      update: (r, value) => { writes.push(["update", r, value]); return tx; },
      delete: (r) => { writes.push(["delete", r]); return tx; },
      commit: async () => apply(writes),
    };
    return tx;
  }
  return { data, operations, failures, doc: ref, collection, collectionGroup: (name) => collection(name, true), batch: transaction,
    runTransaction: async (fn) => { const tx = transaction(); const value = await fn(tx); await tx.commit(); return value; },
    recursiveDelete: async (r) => {
      check(r.path, "recursiveDelete");
      const paths = [...data.keys()].filter((path) => path === r.path || path.startsWith(`${r.path}/`));
      apply(paths.map((path) => ["delete", ref(path)]));
    },
  };
}
module.exports = { memoryFirestore };
