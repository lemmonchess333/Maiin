"""Read deployed source and compare it with the bundle this job uploaded.

Never prints credentials, signed download URLs, source contents, or environment
configuration. Requires the existing deploy identity's sourceCodeGet access.
"""
import io
import json
import pathlib
import subprocess
import urllib.error
import urllib.request
import zipfile


def verify():
    token = subprocess.check_output(
        ["gcloud", "auth", "print-access-token"], text=True
    ).strip()
    root = pathlib.Path(__file__).resolve().parent.parent / "functions"
    paths = ["index.js", "package-lock.json", "lib/publicPhotoUrl.js", "lib/socialCounters.js", "lib/spacePostEngagement.js"]
    for name in ["addCommentCallable", "addSpacePostCommentCallable"]:
        endpoint = (
            "https://cloudfunctions.googleapis.com/v1/projects/"
            f"adaptive-fitness-af8bb/locations/us-central1/functions/{name}"
        )
        headers = {"Authorization": f"Bearer {token}"}
        with urllib.request.urlopen(urllib.request.Request(endpoint, headers=headers), timeout=30) as response:
            metadata = json.load(response)
        if metadata.get("status") != "ACTIVE":
            raise RuntimeError(f"{name}: deployed function is not ACTIVE")
        request = urllib.request.Request(
            endpoint + ":generateDownloadUrl", data=b"{}",
            headers={**headers, "Content-Type": "application/json"}, method="POST",
        )
        with urllib.request.urlopen(request, timeout=30) as response:
            download_url = json.load(response)["downloadUrl"]
        with urllib.request.urlopen(download_url, timeout=60) as response:
            archive = zipfile.ZipFile(io.BytesIO(response.read()))
        for path in paths:
            if archive.read(path) != (root / path).read_bytes():
                raise RuntimeError(f"{name}: deployed {path} differs from uploaded source")
        print(f"Verified deployed source: {name}, version {metadata.get('versionId')}, updated {metadata.get('updateTime')}")


if __name__ == "__main__":
    try:
        verify()
    except urllib.error.HTTPError as error:
        raise SystemExit(f"Deployed source verification failed: HTTP {error.code}") from None
    except urllib.error.URLError:
        raise SystemExit("Deployed source verification failed: network unavailable") from None
