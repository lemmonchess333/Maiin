# Production Rules verification — 7 September 2026

Baseline: `dc43fc990e7a900a85f31bb2458f6ff8daa7d4f0`. Continues security PRs
[#2190](https://github.com/lemmonchess333/Maiin/pull/2190) and
[#2194](https://github.com/lemmonchess333/Maiin/pull/2194).

## Gap addressed

Emulator tests establish the behaviour of checked-in Rules. They do not
establish which Rules production is serving. The existing deploy workflows
also did not read back the active source. Storage's deliberately gated first
deployment makes that distinction particularly important.

`scripts/verify_deployed_rules.py` reads the active service release, follows
its ruleset reference, compares its complete source bytes with the file named
in `firebase.json`, then reads the release again to detect a concurrent change.
It uses the [Rules releases GET API](https://firebase.google.com/docs/reference/rules/rest/v1/projects.releases/get)
and [rulesets GET API](https://firebase.google.com/docs/reference/rules/rest/v1/projects.rulesets/get).

It prints only service/status, the validated ruleset identifier, hashes and
fixed diagnostic codes. Credentials, source contents and API error bodies
are not printed. Redirects and foreign-project ruleset references are refused.
It uses only GET requests and the existing deploy identity. It neither
reads user documents nor changes Rules, IAM, API enablement or App Check.

Both Rules deploy workflows now run the appropriate source verification
after deployment. The separate **Verify Active Production Rules** workflow
checks both services without attempting to deploy either. It runs on main
when its own verifier changes, or manually on main. It has no PR credential
path. The verifier's offline Python tests also run in the existing PR CI job.

## Reading the result

- `match`: active source bytes equal this checkout at the time of the check.
- `mismatch`: active source was read successfully and differs. The two hashes
  identify the compared versions; this is not automatically proof of a
  permission vulnerability. Even a comment or line-ending change counts.
- `unverified`: the check could not establish a comparison. `http-403` means
  the current identity could not perform that API read; it is not evidence
  that the Rules are deployed, absent or permissive. No IAM grant is attempted.
- `release-changed-during-check`: rerun against the settled release.

Every non-match produces exit status 1. One service's failure does not prevent
checking the other. Storage uses the same configured bucket as the app via
`VITE_FIREBASE_STORAGE_BUCKET`, rather than guessing the old `.appspot.com`
default. Public Hosting init configuration currently names
`adaptive-fitness-af8bb.firebasestorage.app`.

Local operator command, with an already authorised gcloud identity:

```sh
TROPOS_STORAGE_BUCKET=adaptive-fitness-af8bb.firebasestorage.app \
  python3 scripts/verify_deployed_rules.py
```

The PR records the actual production workflow result after merge. A passing
source comparison still does not prove Storage-to-Firestore IAM approval or
successful App Check attestation. No production write probe is performed.

## Remaining security work

Fresh audits on this baseline: root full tree **8 moderate**, Functions
production tree **9 moderate**, both **0 high/critical/low**. These are package
dependency findings involving UUID and Admin/Google SDK chains, not nine
demonstrated exploits. No dependency versions changed in this pass. Audit
suggestions include major-version downgrades and are not applied blindly.

Storage's first cross-service approval remains an owner action under
`CLAUDE.md`; the `STORAGE_XSERVICE_APPROVED` gate and Rules contents are
unchanged. If production source differs, do not remove that gate to make the
check pass. Use the documented owner approval and deployment procedure.

App Check enforcement remains off pending native attestation and measured
production token coverage. The existing rollout requires at least 99%
verified requests for seven days before staged per-callable enforcement.
No signed iOS binary or App Check enforcement change is included here.

## Verification

Offline tests cover exact match, drift, source completeness, foreign references,
release changes, independent per-service results, missing bucket configuration,
the configured source path, GET-only transport, redirect refusal, sanitized
authentication/HTTP failures and nonzero CLI exits. Run:

```sh
python3 -m unittest discover -s scripts -p 'test_verify_deployed_rules.py' -v
npm run verify
```

The full app/CI results and production evidence are recorded in the PR. No
claim of active production Rules verification should be made from unit tests.
