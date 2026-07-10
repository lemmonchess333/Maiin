/**
 * R1A-Deletion — kill-switch flag tests.
 *
 * Stress 7 from the Decision 9 grill. The executor MUST honour
 * a Firestore-backed kill-switch (`system/config.deletionExecutorEnabled`)
 * so an operator can halt new deletions post-launch without
 * redeploying the function.
 */
import { describe, it, expect, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const accountDeletion = require("../../../functions/accountDeletion.js");

const { deleteAccount } = accountDeletion;

/* Stub trio that records calls. Tests check behaviour via the
   public interface — they don't peek at internal state.

   `configReadError`: when truthy, the `system/config` `.get()`
   rejects with this error so we can pin the fail-open contract
   (transient Firestore blip on the config read must not disable
   the deletion fleet). */
interface BuildStubsOpts {
  configDoc?: Record<string, unknown>;
  configReadError?: Error;
}
function buildStubs({ configDoc, configReadError }: BuildStubsOpts = {}) {
  const mockEmptySnap = { empty: true, docs: [] };
  const mockBatch = {
    delete: vi.fn(),
    commit: vi.fn().mockResolvedValue(undefined),
  };
  const mockUserDocDelete = vi.fn().mockResolvedValue(undefined);
  const mockProfileDocDelete = vi.fn().mockResolvedValue(undefined);

  // R1A Chunk 3 — in-memory accountDeletionRequests ledger doc so the
  // deletion executor's lease acquire → verify → transition path works
  // against this stub (deleteAccount now engages the write-freeze).
  const ledgerStore: { doc: Record<string, unknown> | undefined } = {
    doc: undefined,
  };

  const firestore = {
    doc: vi.fn((path) => ({
      get: vi.fn().mockImplementation(() => {
        if (path === "system/config" && configReadError) {
          return Promise.reject(configReadError);
        }
        return Promise.resolve({
          exists: configDoc != null && path === "system/config",
          data: () => (path === "system/config" ? configDoc : undefined),
        });
      }),
      delete: path === "system/config" ? vi.fn() : mockProfileDocDelete,
    })),
    collection: vi.fn((name?: string) => {
      if (name === "accountDeletionRequests") {
        return {
          doc: vi.fn(() => ({
            get: vi.fn().mockImplementation(() =>
              Promise.resolve({
                exists: ledgerStore.doc !== undefined,
                data: () => ledgerStore.doc,
              })
            ),
          })),
        };
      }
      return {
        doc: vi.fn(() => ({
          collection: vi.fn(() => ({
            get: vi.fn().mockResolvedValue(mockEmptySnap),
          })),
          delete: mockUserDocDelete,
          get: vi
            .fn()
            .mockResolvedValue({ exists: false, data: () => undefined }),
        })),
        where: vi.fn(() => ({ get: vi.fn().mockResolvedValue(mockEmptySnap) })),
      };
    }),
    batch: vi.fn(() => mockBatch),
    runTransaction: vi.fn(async (cb: (tx: unknown) => unknown) => {
      const tx = {
        get: async () => ({
          exists: ledgerStore.doc !== undefined,
          data: () => ledgerStore.doc,
        }),
        set: (
          _ref: unknown,
          data: Record<string, unknown>,
          o?: { merge?: boolean }
        ) => {
          ledgerStore.doc =
            o && o.merge
              ? { ...(ledgerStore.doc || {}), ...data }
              : { ...data };
        },
      };
      return cb(tx);
    }),
  };

  const auth = {
    deleteUser: vi.fn().mockResolvedValue(undefined),
  };

  const storage = {
    deleteFiles: vi.fn().mockResolvedValue(undefined),
  };

  return {
    firestore,
    auth,
    storage,
    mockBatch,
    mockUserDocDelete,
    mockProfileDocDelete,
  };
}

describe("deleteAccount — kill-switch (Stress 7)", () => {
  const UID = "u-test-kill-switch";
  const silentLogger = { warn: () => {}, error: () => {}, info: () => {} };

  it("throws 'executor-disabled' when system/config.deletionExecutorEnabled === false", async () => {
    const { firestore, auth, storage } = buildStubs({
      configDoc: { deletionExecutorEnabled: false },
    });

    await expect(
      deleteAccount({
        firestore,
        auth,
        storageBucket: storage,
        uid: UID,
        logger: silentLogger,
      })
    ).rejects.toThrow("executor-disabled");
  });

  it("proceeds with deletion when kill-switch is true", async () => {
    const { firestore, auth, storage } = buildStubs({
      configDoc: { deletionExecutorEnabled: true },
    });

    await deleteAccount({
      firestore,
      auth,
      storageBucket: storage,
      uid: UID,
      logger: silentLogger,
    });

    /* The final step of the executor is auth.deleteUser. If it ran,
       the executor passed through the kill-switch gate AND completed
       the full step sequence. */
    expect(auth.deleteUser).toHaveBeenCalledWith(UID);
  });

  it("proceeds when system/config doc is MISSING (defensive default: ENABLED)", async () => {
    /* Lock-out defence: operator forgetting to provision the config
       doc must NOT permanently disable deletion. configDoc undefined
       → doc.exists = false → executor proceeds. */
    const { firestore, auth, storage } = buildStubs({ configDoc: undefined });

    await deleteAccount({
      firestore,
      auth,
      storageBucket: storage,
      uid: UID,
      logger: silentLogger,
    });

    expect(auth.deleteUser).toHaveBeenCalledWith(UID);
  });

  it("proceeds when deletionExecutorEnabled FIELD is missing (default ENABLED)", async () => {
    /* Same lock-out defence: doc exists with other fields but
       the deletion-enabled field was never set. Treat as enabled,
       not disabled. Strict equality with `=== false` in the impl
       means undefined / null / missing all pass through. */
    const { firestore, auth, storage } = buildStubs({
      configDoc: { someOtherField: "value" },
    });

    await deleteAccount({
      firestore,
      auth,
      storageBucket: storage,
      uid: UID,
      logger: silentLogger,
    });

    expect(auth.deleteUser).toHaveBeenCalledWith(UID);
  });

  it("does NO deletion work when kill-switch is false (aborts before step 1, not just before step 7)", async () => {
    /* Behavioural assertion: the kill-switch must abort BEFORE any
       deletion step, not just before the final auth.deleteUser.
       Otherwise the switch would still tear down Firestore data
       while only preserving the Auth user — partial-deletion is
       worse than no deletion (the exact "ghost user with orphan
       data" failure mode the executor docstring at
       accountDeletion.js:8-15 is designed to prevent). */
    const {
      firestore,
      auth,
      storage,
      mockBatch,
      mockUserDocDelete,
      mockProfileDocDelete,
    } = buildStubs({
      configDoc: { deletionExecutorEnabled: false },
    });

    await expect(
      deleteAccount({
        firestore,
        auth,
        storageBucket: storage,
        uid: UID,
        logger: silentLogger,
      })
    ).rejects.toThrow("executor-disabled");

    /* Pin EVERY observable side effect, not just step 7. A regression
       that moves the kill-switch check after step 1 would still skip
       auth.deleteUser but leave the user with shredded subcollections
       and a live login — exactly the partial-deletion case. */
    expect(auth.deleteUser).not.toHaveBeenCalled();
    expect(mockBatch.commit).not.toHaveBeenCalled();
    expect(mockBatch.delete).not.toHaveBeenCalled();
    expect(mockUserDocDelete).not.toHaveBeenCalled();
    expect(mockProfileDocDelete).not.toHaveBeenCalled();
    expect(storage.deleteFiles).not.toHaveBeenCalled();
  });

  it("throws an error tagged with code='executor-disabled' (callable wrapper maps it to HttpsError 'failed-precondition')", async () => {
    /* Stringly-typed `err.message === 'executor-disabled'` is fragile
       under wrappers that prefix or rewrap (e.g. retry logic). The
       executor MUST attach a stable `code` field so the callable
       wrapper in functions/index.js can branch reliably and emit
       HttpsError('failed-precondition', ...) instead of leaking it
       through the generic 'internal' path. */
    const { firestore, auth, storage } = buildStubs({
      configDoc: { deletionExecutorEnabled: false },
    });

    await expect(
      deleteAccount({
        firestore,
        auth,
        storageBucket: storage,
        uid: UID,
        logger: silentLogger,
      })
    ).rejects.toMatchObject({ code: "executor-disabled" });
  });

  it("error carries `details.reason='executor-disabled'` for the HttpsError wrapper", async () => {
    /* The callable wrapper rebuilds the error as
       HttpsError("failed-precondition", "...", { reason: "executor-disabled" }).
       The wrapper needs to read `details` off the rethrown error;
       pin the shape so a future refactor that drops the field is
       caught here, not by client-side regressions. */
    const { firestore, auth, storage } = buildStubs({
      configDoc: { deletionExecutorEnabled: false },
    });

    await expect(
      deleteAccount({
        firestore,
        auth,
        storageBucket: storage,
        uid: UID,
        logger: silentLogger,
      })
    ).rejects.toMatchObject({ details: { reason: "executor-disabled" } });
  });

  it("proceeds (fail-open) when the system/config read itself throws", async () => {
    /* Lock-out defence — transient Firestore failure on the config
       read must NOT disable the entire deletion fleet. Matches the
       fail-open semantics of `isFlagEnabled` in functions/index.js
       (cache + try/catch + default true) — applied here without the
       cache because the deletion path is far less hot than the
       feature-flag path. */
    const { firestore, auth, storage } = buildStubs({
      configReadError: new Error("firestore-unavailable"),
    });

    await deleteAccount({
      firestore,
      auth,
      storageBucket: storage,
      uid: UID,
      logger: silentLogger,
    });

    expect(auth.deleteUser).toHaveBeenCalledWith(UID);
  });

  /* Malformed-shape coverage. A value that clearly reads as "disabled" (incl.
     the string "false" the Console stores by default) is now HONOURED as the
     emergency stop — see the F5 describe below. Any OTHER non-boolean value (an
     unrecognised string, a number, null) is treated as ENABLED (fail-open,
     lock-out defence) and emits a `kill_switch_malformed` warn so the operator
     gets a log signal that their write didn't take a recognised form. These
     tests pin that fail-open-and-warn half. */
  describe("malformed deletionExecutorEnabled values (fail-open + warn)", () => {
    const cases: Array<[string, unknown]> = [
      ["null", null],
      ["number 0", 0],
      ["string 'true'", "true"],
      ["string 'banana' (unrecognised)", "banana"],
    ];
    for (const [label, value] of cases) {
      it(`proceeds and warns on malformed shape: ${label}`, async () => {
        const warn = vi.fn();
        const logger = { warn, error: () => {}, info: () => {} };
        const { firestore, auth, storage } = buildStubs({
          configDoc: { deletionExecutorEnabled: value },
        });

        await deleteAccount({
          firestore,
          auth,
          storageBucket: storage,
          uid: UID,
          logger,
        });

        expect(auth.deleteUser).toHaveBeenCalledWith(UID);
        expect(warn).toHaveBeenCalledWith(
          "deleteAccount.kill_switch_malformed",
          expect.objectContaining({ uid: UID })
        );
      });
    }

    it("proceeds WITHOUT a malformed warn when the field is simply missing (vs wrong-typed)", async () => {
      /* A missing field is the legitimate default-on case, not an
         operator mistake — distinguish it from malformed values so
         the warn-rate metric isn't polluted by every deletion. */
      const warn = vi.fn();
      const logger = { warn, error: () => {}, info: () => {} };
      const { firestore, auth, storage } = buildStubs({
        configDoc: { someOtherField: "value" },
      });

      await deleteAccount({
        firestore,
        auth,
        storageBucket: storage,
        uid: UID,
        logger,
      });

      expect(auth.deleteUser).toHaveBeenCalledWith(UID);
      expect(warn).not.toHaveBeenCalledWith(
        "deleteAccount.kill_switch_malformed",
        expect.anything()
      );
    });
  });

  /* F5 — a value that unambiguously reads as "disabled" (incl. the string
     "false" the Console stores by default) is HONOURED as the emergency stop,
     not silently ignored + warned. */
  describe("stringified disable values are honoured (audit F5)", () => {
    const disableCases: Array<[string, unknown]> = [
      ['string "false"', "false"],
      ['string "FALSE" (case-insensitive)', "FALSE"],
      ['string " off " (trimmed)', " off "],
      ['string "0"', "0"],
      ['string "no"', "no"],
      ['string "disabled"', "disabled"],
    ];
    for (const [label, value] of disableCases) {
      it(`throws executor-disabled and does NO work on ${label}`, async () => {
        const warn = vi.fn();
        const logger = { warn, error: () => {}, info: () => {} };
        const { firestore, auth, storage } = buildStubs({
          configDoc: { deletionExecutorEnabled: value },
        });

        await expect(
          deleteAccount({
            firestore,
            auth,
            storageBucket: storage,
            uid: UID,
            logger,
          })
        ).rejects.toThrow("executor-disabled");
        expect(auth.deleteUser).not.toHaveBeenCalled();
        // Honoured as a recognised stop — NOT flagged "malformed".
        expect(warn).not.toHaveBeenCalledWith(
          "deleteAccount.kill_switch_malformed",
          expect.anything()
        );
      });
    }
  });

  describe("readsAsDisabled (F5 pure helper)", () => {
    const { readsAsDisabled } = accountDeletion;
    it("true for boolean false and disable-token strings", () => {
      for (const v of [
        false,
        "false",
        "FALSE",
        " off ",
        "0",
        "no",
        "disabled",
      ]) {
        expect(readsAsDisabled(v)).toBe(true);
      }
    });
    it("false (fail-open) for booleans-true, unrecognised strings, numbers, null", () => {
      for (const v of [true, "true", "banana", 0, 1, null, undefined, {}]) {
        expect(readsAsDisabled(v)).toBe(false);
      }
    });
  });

  it("emits structured trip event `deleteAccount.kill_switch_trip` with uid (pinned for log-based metric)", async () => {
    /* The dotted event name is the grep target for the Cloud Logging
       log-based metric and on-call runbook. Pinning it here couples
       the runbook's filter to the test suite — change the event name,
       this test fails, the runbook gets updated in the same PR. */
    const warn = vi.fn();
    const logger = { warn, error: () => {}, info: () => {} };
    const { firestore, auth, storage } = buildStubs({
      configDoc: { deletionExecutorEnabled: false },
    });

    await expect(
      deleteAccount({
        firestore,
        auth,
        storageBucket: storage,
        uid: UID,
        logger,
      })
    ).rejects.toThrow("executor-disabled");

    expect(warn).toHaveBeenCalledWith(
      "deleteAccount.kill_switch_trip",
      expect.objectContaining({ uid: UID })
    );
  });

  it("emits structured read-failed event when the config read throws (no false alarm as a trip)", async () => {
    const warn = vi.fn();
    const logger = { warn, error: () => {}, info: () => {} };
    const { firestore, auth, storage } = buildStubs({
      configReadError: new Error("firestore-unavailable"),
    });

    await deleteAccount({
      firestore,
      auth,
      storageBucket: storage,
      uid: UID,
      logger,
    });

    expect(warn).toHaveBeenCalledWith(
      "deleteAccount.kill_switch_read_failed",
      expect.objectContaining({ uid: UID, error: "firestore-unavailable" })
    );
    expect(warn).not.toHaveBeenCalledWith(
      "deleteAccount.kill_switch_trip",
      expect.anything()
    );
  });
});
