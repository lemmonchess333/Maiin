"""Read-only release gate for deployed composite/single-field indexes and TTL.

Uses the existing deployment identity. Never logs tokens or response bodies.
API states: https://cloud.google.com/firestore/docs/reference/rest/v1/projects.databases.collectionGroups.fields
"""
import json
import pathlib
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request

BASE = "https://firestore.googleapis.com/v1/projects/adaptive-fitness-af8bb/databases/(default)/collectionGroups/-"


def list_resources(kind, token, **params):
    values = []
    while True:
        url = f"{BASE}/{kind}?{urllib.parse.urlencode(params)}"
        request = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
        with urllib.request.urlopen(request, timeout=30) as response:
            page = json.load(response)
        values.extend(page.get(kind, []))
        if not page.get("nextPageToken"):
            return values
        params["pageToken"] = page["nextPageToken"]


def index_key(index):
    # The API appends __name__ automatically. All configured indexes use its
    # default direction; retain order among the actual query fields.
    fields = tuple((f["fieldPath"], f.get("order"), f.get("arrayConfig"))
                   for f in index.get("fields", []) if f["fieldPath"] != "__name__")
    return index.get("queryScope", "COLLECTION"), fields


def pending_resources(spec, indexes, fields):
    pending = []
    for desired in spec.get("indexes", []):
        matches = [i for i in indexes if
                   i["name"].split("/collectionGroups/")[1].split("/")[0] == desired["collectionGroup"]
                   and index_key(i) == index_key(desired)]
        label = f"index {desired['collectionGroup']} {index_key(desired)}"
        if any(i.get("state") == "NEEDS_REPAIR" for i in matches):
            raise RuntimeError(f"{label} needs repair")
        if not any(i.get("state") == "READY" for i in matches):
            pending.append(label)
    actual_fields = {urllib.parse.unquote(f["name"].split("/collectionGroups/")[1]): f for f in fields}
    for desired in spec.get("fieldOverrides", []):
        label = f"{desired['collectionGroup']}/fields/{desired['fieldPath']}"
        actual = actual_fields.get(label, {})
        if desired.get("ttl"):
            state = actual.get("ttlConfig", {}).get("state")
            if state == "NEEDS_REPAIR":
                raise RuntimeError(f"TTL {label} needs repair")
            if state != "ACTIVE":
                pending.append(f"TTL {label}")
            if actual.get("ttlConfig", {}).get("expirationOffset", "0s") not in ("0s", "0.000000000s"):
                raise RuntimeError(f"TTL {label} has an unexpected expiration offset")
        config = actual.get("indexConfig", {})
        if not actual or config.get("reverting"):
            pending.append(f"field {label}")
            continue
        for item in desired.get("indexes", []):
            expected = {"queryScope": item["queryScope"], "fields": [
                {"fieldPath": desired["fieldPath"], **{k: item[k] for k in ("order", "arrayConfig") if k in item}}]}
            matches = [i for i in config.get("indexes", []) if index_key(i) == index_key(expected)]
            if any(i.get("state") == "NEEDS_REPAIR" for i in matches):
                raise RuntimeError(f"field index {label} needs repair")
            if not any(i.get("state") == "READY" for i in matches):
                pending.append(f"field index {label} {item}")
        if desired.get("indexes") == [] and (config.get("indexes") or config.get("usesAncestorConfig")):
            pending.append(f"index exemption {label}")
    return pending


def verify():
    root = pathlib.Path(__file__).resolve().parent.parent
    spec = json.loads((root / "firestore.indexes.json").read_text())
    deadline = time.monotonic() + 3600
    while True:
        # Refresh on every poll: index/TTL builds can outlast an access token.
        token = subprocess.check_output(["gcloud", "auth", "print-access-token"], text=True).strip()
        pending = pending_resources(spec, list_resources("indexes", token),
                                    list_resources("fields", token, filter="indexConfig.usesAncestorConfig=false OR ttlConfig:*"))
        if not pending:
            print("Verified: all configured indexes READY and retention TTL policies ACTIVE.", flush=True)
            return
        if time.monotonic() >= deadline:
            raise RuntimeError("Firestore readiness timed out: " + "; ".join(pending))
        print("Waiting for Firestore: " + "; ".join(pending), flush=True)
        time.sleep(30)


if __name__ == "__main__":
    try:
        verify()
    except urllib.error.HTTPError as error:
        raise SystemExit(f"Firestore readiness failed: HTTP {error.code}") from None
    except urllib.error.URLError:
        raise SystemExit("Firestore readiness failed: network unavailable") from None
    except RuntimeError as error:
        raise SystemExit(str(error)) from None
