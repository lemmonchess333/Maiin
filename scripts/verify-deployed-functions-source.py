"""Read deployed source and compare it with the bundle this job uploaded.

Never prints credentials, signed download URLs, source contents, or environment
configuration. Requires the existing deploy identity's sourceCodeGet access.
"""
import io
import json
import pathlib
import re
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
RETRY_REQUIRED = frozenset({
    "onChallengeParticipantCreated", "onWorkoutCreated", "onRunCreated",
    "onWorkoutUpdated", "onRunUpdated", "onWorkoutDeleted", "onRunDeleted",
    "onActivityCreated", "onGoalSpaceEventCreated", "onPublicProfileWritten",
    "onFollowerCreated", "onFollowRequestCreated",
    "onBlockWritten", "onPublicProfileIdentityChanged",
    "onChallengeParticipantWritten",
})
PUSH_RUNTIME_LIMITS = {
    "claimPushDeviceToken": (100, None),
    "releasePushDeviceToken": (100, None),
    "sendTestPush": (100, None),
    "hourlyStreakNudge": (1, "540s"),
    "hourlyChallengeAnnouncements": (1, "540s"),
}


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


def source_targets():
    """The executing exports and source artifacts each release must read back."""
    comment_paths = ["index.js", "package-lock.json", "lib/publicPhotoUrl.js", "lib/socialCounters.js", "lib/spacePostEngagement.js",
                     "lib/restriction.js", "lib/commentLimit.js", "lib/commentRejection.js"]
    training_paths = ["index.js", "package-lock.json", "lib/stateTransition.js", "lib/workoutCorrections.js", "lib/programCommands.js"]
    deletion_paths = ["index.js", "package-lock.json", "accountDeletion.js", "lib/spaceIds.js",
                      "lib/accountDeletionSocial.js", "lib/accountDeletionRetry.js",
                      "lib/accountDeletionLocks.js", "lib/accountDeletionAuth.js",
                      "lib/accountDeletionLedger.js", "lib/accountDeletionMinimisation.js",
                      "lib/accountDeletionStatus.js", "lib/commentReactions.js",
                      "lib/leagues.js"]
    challenge_paths = ["index.js", "package-lock.json", "lib/challengeDefs.js",
                       "lib/challengeBackfill.js", "lib/challengeActivityWindow.js",
                       "lib/challengeTiers.js", "lib/challengeMarkers.js",
                       "lib/challengeParticipationProgress.js", "lib/runEligibility.js",
                       "lib/workoutVolume.js"]
    token_paths = ["index.js", "package-lock.json", "lib/pushTokenOwnership.js",
                   "lib/accountDeletionLedger.js", "lib/accountDeletionStatus.js",
                   "lib/deletedAccountsTombstone.js"]
    push_paths = token_paths + ["lib/pushConsent.js", "lib/pushSend.js",
                                "lib/pushSchedule.js", "lib/accountDeletionLocks.js"]
    circle_paths = ["index.js", "package-lock.json", "lib/goalSpaceMembership.js",
                    "lib/restriction.js", "lib/accountDeletionLocks.js"]
    report_paths = ["index.js", "lib/reportTargets.js", "lib/postPhotos.js", "lib/routeMapFiles.js"]
    invite_paths = ["index.js", "package-lock.json", "lib/inviteCodes.js",
                    "lib/deletionTransactionGuard.js", "lib/accountDeletionStatus.js",
                    "lib/restriction.js", "lib/accountDeletionLocks.js"]
    # Soc15 call 3: the leagues' one writer, its rules and its planned count.
    league_lib = ["lib/leagues.js", "lib/leagueRules.js", "lib/leaguePlanned.js"]
    league_paths = ["index.js", "package-lock.json"] + league_lib + [
                    "lib/friendsBoard.js", "lib/deletionTransactionGuard.js",
                    "lib/accountDeletionStatus.js", "lib/restriction.js",
                    "lib/accountDeletionLocks.js"]
    return {
        "deleteMyAccount": deletion_paths,
        "resumeAccountDeletions": deletion_paths,
        "completeOnboarding": ["index.js", "lib/accountDeletionLocks.js"],
        "sendVerificationEmailCallable": ["index.js", "email/accountEmails.js"],
        "addCommentCallable": comment_paths + ["lib/objectionableText.js"],
        "addSpacePostCommentCallable": comment_paths + ["lib/objectionableText.js"],
        # Moderation (App Review 1.2): the report alert and the Space post filter.
        # A reported post's preview carries its photos (Soc15 call 2), so the
        # queue's reader and the hide action read back the same resolver.
        "createReport": report_paths + ["lib/reportAlert.js"],
        "listPendingReports": report_paths,
        "resolveReport": report_paths,
        "onSpacePostWritten": ["index.js", "lib/spacePostModeration.js", "lib/spacePostPhoto.js"],
        "onPublicProfileWritten": ["index.js", "package-lock.json", "lib/objectionableText.js",
                                   "profanityFilter.js", "lib/hateTerms.js", "lib/triggerRetry.js",
                                   "lib/accountDeletionLocks.js"],
        # A new public name or photo, carried to the person's recent copies.
        "onPublicProfileIdentityChanged": ["index.js", "package-lock.json", "lib/identityResync.js",
                                           "lib/publicPhotoUrl.js", "lib/objectionableText.js",
                                           "profanityFilter.js", "lib/hateTerms.js",
                                           "lib/deletionTransactionGuard.js", "lib/restriction.js",
                                           "lib/spaceIds.js", "lib/triggerRetry.js",
                                           "lib/accountDeletionLocks.js"],
        # Who has blocked each account, the copy the blocked person's app reads.
        "onBlockWritten": ["index.js", "package-lock.json", "lib/blockMirror.js",
                           "lib/triggerRetry.js", "lib/accountDeletionLocks.js"],
        # A Circle's invite code expires, and its owner replaces it.
        "joinGoalSpace": circle_paths,
        "renewGoalSpaceInviteCode": circle_paths,
        # The one writer of partner bonds: the limit for both people, counted
        # in the transaction that makes the bond. The rules refuse a client's.
        "startPartnerStreak": ["index.js", "package-lock.json", "lib/partnerBonds.js",
                               "lib/deletionTransactionGuard.js", "lib/accountDeletionStatus.js",
                               "lib/restriction.js", "lib/accountDeletionLocks.js"],
        # Soc15 invites: the one writer of follows both ways from a code, and
        # of the codes themselves, with the checks it holds them to.
        "redeemInvite": invite_paths + ["lib/socialFanout.js", "lib/notificationPreferences.js"],
        "getInviteCode": invite_paths,
        # Soc15 call 3: weekly leagues. The turn settles, forms and notifies;
        # the callable joins and leaves; the session triggers below keep each
        # standing current.
        "weeklyLeagueTurn": league_paths + ["lib/socialFanout.js", "lib/notificationPreferences.js",
                                            "lib/discoveryHidden.js"],
        "setLeagueSharing": league_paths,
        # Ship1: the photos other people see, screened for nudity.
        "readReportedActivityMedia": ["index.js", "lib/activityMedia.js", "lib/photoScreen.js", "lib/deletionTransactionGuard.js", "lib/accountDeletionStatus.js", "adminAuth.js"],
        "readActivityMedia": ["index.js", "lib/activityMedia.js", "lib/photoScreen.js", "lib/deletionTransactionGuard.js", "lib/accountDeletionStatus.js"],
        "uploadActivityMedia": ["index.js", "lib/activityMedia.js", "lib/photoScreen.js", "lib/deletionTransactionGuard.js", "lib/accountDeletionStatus.js"],
        "screenPhoto": ["index.js", "lib/photoScreen.js"],
        "screenUploadedPhoto": ["index.js", "lib/photoScreen.js"],
        # S4e: a restriction refuses props and comments; the moderation page lifts one.
        "toggleKudosCallable": ["index.js", "lib/restriction.js", "lib/socialCounters.js",
                                "lib/engagementRejection.js", "lib/documentId.js"],
        "liftRestriction": ["index.js"],
        # Race day: the daily no-show and recovery checks, and the recovery
        # entry a saved race run makes.
        "onRunCreated": challenge_paths + ["lib/raceReconciliation.js", "lib/raceDayCompletion.js"]
                        + league_lib,
        "configurePlan": training_paths,
        "applyProgramCommand": training_paths,
        "onWorkoutCreated": training_paths + challenge_paths[2:] + league_lib,
        "onWorkoutUpdated": training_paths + challenge_paths[2:] + league_lib,
        # Monthly rotation and participation must execute the same source that
        # passed CI, including the new active-day/minute recomputation helper.
        # Checking index.js alone misses a stale independently changed library.
        "rolloverChallenges": ["index.js", "package-lock.json", "lib/challengeDefs.js"],
        "onChallengeParticipantCreated": challenge_paths,
        # Soc15: the one writer of medals and the public trophy case.
        "onChallengeParticipantWritten": ["index.js", "package-lock.json", "lib/medals.js",
                                          "lib/challengeActivityWindow.js", "lib/dateUtils.js",
                                          "lib/deletionTransactionGuard.js",
                                          "lib/accountDeletionStatus.js", "lib/triggerRetry.js",
                                          "lib/accountDeletionLocks.js"],
        "onRunUpdated": challenge_paths + league_lib,
        # The reversal is what a delete runs, and it fails the event when it
        # does not land so the retry can apply it.
        "onWorkoutDeleted": challenge_paths + ["lib/activityReversal.js", "lib/fastestEffortRebuild.js",
                                              "lib/triggerRetry.js"] + league_lib,
        "onRunDeleted": challenge_paths + ["lib/activityReversal.js", "lib/fastestEffortRebuild.js",
                                              "lib/triggerRetry.js"] + league_lib,
        # Read back the privacy-safe feed index writer and the Circle
        # admission receipt before a release can report either trigger current.
        "onActivityCreated": ["index.js", "package-lock.json", "lib/socialFanout.js", "lib/feedIndex.js",
                              "lib/discoveryHidden.js"],
        # A deleted post leaves the feeds, and its map files and photos go with it.
        "onActivityDeleted": ["index.js", "package-lock.json", "lib/socialFanout.js",
                              "lib/routeMapFiles.js", "lib/postPhotos.js"],
        "onGoalSpaceEventCreated": ["index.js", "package-lock.json", "rateLimiter.js", "lib/socialFanout.js"],
        "onFollowerCreated": ["index.js", "package-lock.json", "lib/socialFanout.js",
                              "lib/followBackfill.js", "lib/feedIndex.js"],
        "onFollowRequestCreated": ["index.js", "package-lock.json", "lib/socialFanout.js"],
        "getCurrentWeather": ["index.js", "currentWeather.js", "lib/metWeather.js"],
        # The reminder before a free trial is charged, and the sync it reads.
        "trialReminderSweep": ["index.js", "trialReminders.js", "lib/trialReminder.js",
                               "lib/trialReminderEmail.js", "revenueCat.js",
                               "lib/revenueCatEntitlement.js", "email/accountEmails.js"],
        "syncRevenueCatEntitlement": ["index.js", "revenueCat.js", "lib/revenueCatEntitlement.js",
                                      "lib/trialReminder.js"],
        # The daily race sweep: a no-show, the end of recovery, a finished race with no plan.
        "dailyRaceReconciliationSweep": ["index.js", "lib/raceReconciliation.js",
                                         "lib/raceDayCompletion.js", "lib/runModeResolution.js", "lib/dateUtils.js"],
        # Native APNs alerts share the existing send/ownership path. Every
        # executing sender and callable must have the new source, not only
        # the newly introduced monthly schedule.
        "claimPushDeviceToken": token_paths,
        "releasePushDeviceToken": token_paths,
        "sendTestPush": push_paths,
        "hourlyStreakNudge": push_paths + ["lib/streakNudge.js", "lib/activeDates.js", "lib/badgeNudge.js"],
        "hourlyChallengeAnnouncements": push_paths + ["lib/challengeAnnouncements.js",
                                                      "lib/challengeTiers.js",
                                                      "lib/challengeDefs.js", "lib/challengeActivityWindow.js", "lib/dateUtils.js",
                                                      "lib/streakNudge.js"],
    }


def verify_function_source(name, paths, root, token):
    endpoint = (
        "https://cloudfunctions.googleapis.com/v1/projects/"
        f"adaptive-fitness-af8bb/locations/us-central1/functions/{name}"
    )
    headers = {"Authorization": f"Bearer {token}"}
    metadata = json.loads(read(urllib.request.Request(endpoint, headers=headers), 30))
    if metadata.get("status") != "ACTIVE":
        raise RuntimeError(f"{name}: deployed function is not ACTIVE")
    if name in PUSH_RUNTIME_LIMITS:
        instances, timeout = PUSH_RUNTIME_LIMITS[name]
        if type(metadata.get("maxInstances")) is not int or metadata["maxInstances"] != instances:
            raise RuntimeError(f"{name}: deployed instance cap differs from the release limit")
        # Protobuf Duration permits equivalent fractional-zero spellings.
        deployed_timeout = metadata.get("timeout")
        if timeout is not None and (
            not isinstance(deployed_timeout, str)
            or not re.fullmatch(re.escape(timeout[:-1]) + r"(?:\.0{1,9})?s", deployed_timeout)
        ):
            raise RuntimeError(f"{name}: deployed timeout differs from the release limit")
    if name in RETRY_REQUIRED:
        policy = metadata.get("eventTrigger", {}).get("failurePolicy", {})
        # The v1 API represents enabled retries as {"retry": {}}; testing
        # its truthiness would mistake that valid empty object for disabled.
        if not isinstance(policy.get("retry"), dict):
            raise RuntimeError(f"{name}: deployed event retries are not enabled")
    request = urllib.request.Request(
        endpoint + ":generateDownloadUrl", data=b"{}",
        headers={**headers, "Content-Type": "application/json"}, method="POST",
    )
    download_url = json.loads(read(request, 30))["downloadUrl"]
    with zipfile.ZipFile(io.BytesIO(read(download_url, 60))) as archive:
        for path in paths:
            if archive.read(path) != (root / path).read_bytes():
                raise RuntimeError(f"{name}: deployed {path} differs from uploaded source")
    print(f"Verified deployed source: {name}, version {metadata.get('versionId')}, updated {metadata.get('updateTime')}")


def verify():
    token = subprocess.check_output(
        ["gcloud", "auth", "print-access-token"], text=True
    ).strip()
    root = pathlib.Path(__file__).resolve().parent.parent / "functions"
    for name, paths in source_targets().items():
        verify_function_source(name, paths, root, token)


if __name__ == "__main__":
    try:
        verify()
    except urllib.error.HTTPError as error:
        raise SystemExit(f"Deployed source verification failed: HTTP {error.code}") from None
    except (urllib.error.URLError, TimeoutError, ConnectionError):
        raise SystemExit("Deployed source verification failed: network unavailable") from None
