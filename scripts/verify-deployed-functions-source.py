"""Read deployed source and compare it with the bundle this job uploaded.

Never prints credentials, signed download URLs, source contents, or environment
configuration. Requires the existing deploy identity's sourceCodeGet access.
"""
import io
import json
import pathlib
import subprocess
import time
import urllib.error
import urllib.request
import zipfile

# What a later try can clear: Google busy or failing, or the request never
# completing. Release 236 (2026-10-06) stopped a whole web release on one 503
# here while the functions themselves had deployed fine.
TRANSIENT_STATUS = frozenset({408, 429, *range(500, 600)})
# Seconds before each further try: four tries over about a minute.
RETRY_DELAYS = (5, 15, 45)


def read(request, timeout, opener=urllib.request.urlopen, sleep=time.sleep):
    """The response body, trying again after a failure a later try can clear.

    A refusal (401, 403, 404) fails at once: no wait changes it.
    """
    for delay in (*RETRY_DELAYS, None):
        try:
            with opener(request, timeout=timeout) as response:
                return response.read()
        except urllib.error.HTTPError as error:
            if error.code not in TRANSIENT_STATUS or delay is None:
                raise
            reason = f"HTTP {error.code}"
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            if delay is None:
                raise
            reason = "no answer"
        print(f"Google gave {reason}; trying again in {delay} s")
        sleep(delay)


def verify():
    token = subprocess.check_output(
        ["gcloud", "auth", "print-access-token"], text=True
    ).strip()
    root = pathlib.Path(__file__).resolve().parent.parent / "functions"
    comment_paths = ["index.js", "package-lock.json", "lib/publicPhotoUrl.js", "lib/socialCounters.js", "lib/spacePostEngagement.js",
                     "lib/restriction.js"]
    training_paths = ["index.js", "package-lock.json", "lib/stateTransition.js", "lib/workoutCorrections.js", "lib/programCommands.js"]
    deletion_paths = ["index.js", "package-lock.json", "accountDeletion.js", "lib/spaceIds.js",
                      "lib/accountDeletionSocial.js", "lib/accountDeletionRetry.js",
                      "lib/accountDeletionLocks.js", "lib/accountDeletionAuth.js",
                      "lib/accountDeletionLedger.js", "lib/accountDeletionMinimisation.js",
                      "lib/accountDeletionStatus.js"]
    targets = {
        "deleteMyAccount": deletion_paths,
        "resumeAccountDeletions": deletion_paths,
        "completeOnboarding": ["index.js", "lib/accountDeletionLocks.js"],
        "sendVerificationEmailCallable": ["index.js", "email/accountEmails.js"],
        "addCommentCallable": comment_paths + ["lib/objectionableText.js"],
        "addSpacePostCommentCallable": comment_paths + ["lib/objectionableText.js"],
        # Moderation (App Review 1.2): the report alert and the Space post filter.
        "createReport": ["index.js", "lib/reportAlert.js", "lib/reportTargets.js"],
        "onSpacePostWritten": ["index.js", "lib/spacePostModeration.js"],
        # S4e: a restriction refuses props and comments; the moderation page lifts one.
        "toggleKudosCallable": ["index.js", "lib/restriction.js", "lib/socialCounters.js"],
        "liftRestriction": ["index.js"],
        # Race day: the daily no-show and recovery checks, and the recovery
        # entry a saved race run makes.
        "dailyRaceReconciliationSweep": ["index.js", "lib/raceReconciliation.js",
                                         "lib/raceDayCompletion.js"],
        "onRunCreated": ["index.js", "lib/raceReconciliation.js", "lib/raceDayCompletion.js"],
        "configurePlan": training_paths,
        "applyProgramCommand": training_paths,
        "onWorkoutCreated": training_paths,
        "onWorkoutUpdated": training_paths,
        "getCurrentWeather": ["index.js", "currentWeather.js", "lib/metWeather.js"],
        # The reminder before a free trial is charged, and the sync it reads.
        "trialReminderSweep": ["index.js", "trialReminders.js", "lib/trialReminder.js",
                               "lib/trialReminderEmail.js", "revenueCat.js",
                               "lib/revenueCatEntitlement.js", "email/accountEmails.js"],
        "syncRevenueCatEntitlement": ["index.js", "revenueCat.js", "lib/revenueCatEntitlement.js",
                                      "lib/trialReminder.js"],
        # The daily race sweep: a no-show, the end of recovery, a finished race with no plan.
        "dailyRaceReconciliationSweep": ["index.js", "lib/raceReconciliation.js",
                                         "lib/runModeResolution.js", "lib/dateUtils.js"],
    }
    for name, paths in targets.items():
        endpoint = (
            "https://cloudfunctions.googleapis.com/v1/projects/"
            f"adaptive-fitness-af8bb/locations/us-central1/functions/{name}"
        )
        headers = {"Authorization": f"Bearer {token}"}
        metadata = json.loads(read(urllib.request.Request(endpoint, headers=headers), 30))
        if metadata.get("status") != "ACTIVE":
            raise RuntimeError(f"{name}: deployed function is not ACTIVE")
        request = urllib.request.Request(
            endpoint + ":generateDownloadUrl", data=b"{}",
            headers={**headers, "Content-Type": "application/json"}, method="POST",
        )
        download_url = json.loads(read(request, 30))["downloadUrl"]
        archive = zipfile.ZipFile(io.BytesIO(read(download_url, 60)))
        for path in paths:
            if archive.read(path) != (root / path).read_bytes():
                raise RuntimeError(f"{name}: deployed {path} differs from uploaded source")
        print(f"Verified deployed source: {name}, version {metadata.get('versionId')}, updated {metadata.get('updateTime')}")


if __name__ == "__main__":
    try:
        verify()
    except urllib.error.HTTPError as error:
        raise SystemExit(f"Deployed source verification failed: HTTP {error.code}") from None
    except (urllib.error.URLError, TimeoutError, ConnectionError):
        raise SystemExit("Deployed source verification failed: network unavailable") from None
