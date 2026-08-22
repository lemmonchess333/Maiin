# Privacy claims — what holds them up, and how to re-verify

The document F3d pin 2 asked for and never got. `PrivacyPolicy.tsx`
section 7 makes two statements about **someone else's system** (Google's),
and this file records what actually holds each one up, so a release check
is a diff against this page instead of a re-derivation from scratch —
which is why the pin went unticked for months: nobody knew what "verify on
every release" was supposed to compare against.

First established 2026-08-19 (the endpoint read), completed 2026-08-22
(the Google-side facts). Owner of record for the residual console checks:
the operator.

## The two claims

From `src/pages/PrivacyPolicy.tsx`, section 7 (AI Food Analysis):

1. _"Photos are temporarily processed and not permanently retained by
   Google."_
2. _"We do not use your food photos for AI model training."_

Both were checked 2026-08-22 and **both stand as written**. No policy
rewording was needed.

## What holds them up

### The endpoint is Vertex AI — this is the load-bearing fact

```
functions/index.js:1236, :1444
  https://us-central1-aiplatform.googleapis.com/v1/projects/…
    /locations/us-central1/publishers/google/models/gemini-2.0-flash:generateContent
```

`aiplatform.googleapis.com` is the **Vertex AI** enterprise endpoint, NOT
the consumer Gemini Developer API (`generativelanguage.googleapis.com`).
The distinction decides claim 2 outright: the Developer API's free tier
may use submitted content to improve Google's products, whereas **Vertex
AI customer data is contractually excluded from training Google's
foundation models** under the Google Cloud terms. So the training claim
rests on a contract, not on a setting someone could forget to flip.

Re-verified 2026-08-22: both call sites still target `aiplatform`, and no
`generativelanguage` reference exists anywhere in `functions/`.

### Google's retention posture for Vertex AI Gemini (as of 2026-08-22)

Per Google's Vertex AI data-governance and abuse-monitoring
documentation:

- **No training on customer data.** Google states customer prompts/data
  submitted to Vertex AI are not used to train or fine-tune its models
  without permission.
- **Serving cache:** inputs may be cached **up to 24 hours** by default
  in the serving data centre; cache can be disabled per-project for a
  zero-retention posture.
- **Abuse-monitoring prompt logging is conditional, not blanket:**
  prompts may be logged only when automated safety classifiers flag
  suspicious activity, retained (per the abuse-monitoring doc) for a
  bounded window — **30 days** in the canonical page's wording, though
  one secondary summary said 90; see the verification caveat below.
  Customers on invoiced / Master Agreement Cloud accounts are exempt
  from prompt logging by default, and any customer can request an
  abuse-monitoring exception for zero data retention.

Every route is **temporary and bounded** — which is exactly what the
policy sentence claims. "Temporarily processed and not permanently
retained" survives the worst case (a flagged prompt held for the bounded
abuse window) without stretching.

**Verification caveat — read before re-citing the numbers.** The agent
sandbox's egress proxy blocks `docs.cloud.google.com` (the canonical doc
host; `cloud.google.com` 301s there), so the 2026-08-22 facts were
triangulated from two independent web-search syntheses of the indexed
canonical pages rather than a first-hand page read. The two syntheses
agreed on everything except the flagged-prompt retention window (30 vs 90
days) — a discrepancy that does not affect the policy sentence (both are
temporary) but should be settled by opening the canonical pages from a
real browser at the next check:

- https://docs.cloud.google.com/vertex-ai/generative-ai/docs/data-governance
- https://docs.cloud.google.com/vertex-ai/generative-ai/docs/learn/abuse-monitoring

### What the repo's own code guarantees (the Tropos half)

- **No server-side photo storage** — Food9's standing invariant: the scan
  photo is written to the device (`src/lib/foodPhotoStore.ts`,
  `Directory.LibraryNoCloud`), no photo field is persisted to Firestore,
  and retention is 90 days because `FOOD_TAP_BACK_DAYS` is 90
  (`foodPhotoStore.test.ts` fails if either side moves alone).
- **No request/response logging in our code** — grepped `functions/` for
  prompt/response-logging configuration: none (the default, and the one
  we want).

## Residual — operator-only, still open

- [ ] **Project-level logging check (Cloud Console).** Absent from the
      code is necessary, not sufficient: Vertex request-response logging
      can be enabled outside the repo. Confirm it is OFF for
      `adaptive-fitness-af8bb`.
- [ ] **Settle whether the project's billing profile exempts it from
      abuse-monitoring prompt logging by default.** Blaze is attached
      billing but self-serve — whether that counts as the exempt
      invoiced/Master-Agreement class is a fact about the account, not
      the code. If not exempt and a stricter posture is wanted, the
      abuse-monitoring exception form is the route.
- [ ] **Open the two canonical URLs above from a browser** and settle the
      30-vs-90-day figure; correct this file if the canonical page says
      otherwise.

## Per-release re-verification (the actual point of this file)

Before each App Store submission:

1. `rg -n "aiplatform.googleapis.com" functions/` — still Vertex, still
   the only Gemini endpoint (`rg generativelanguage functions/` returns
   nothing).
2. Skim the two canonical Google pages for changes to the training
   exclusion, the cache default, or the abuse-monitoring scope; diff
   against this file's "retention posture" section and update BOTH this
   file and, if a claim no longer holds, `PrivacyPolicy.tsx` section 7.
3. Confirm the Food9 invariant tests still pass (they run in CI; this is
   a box-tick, not a rerun).

Record each pass by appending a dated line here:

- 2026-08-22 — initial verification. Endpoint Vertex ✓, no logging in
  code ✓, Google-side facts triangulated (caveat above), policy sentences
  stand as written.
