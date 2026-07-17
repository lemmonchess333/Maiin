#!/usr/bin/env node
/**
 * Circles capture seed (SOCIAL-FOCUS-01 visual QA) — provisions a
 * DEDICATED capture user with one populated Circle so the capture rig
 * can screenshot the Circle detail sheet + CircleWeeklyFocusSheet at
 * 393px in light + dark.
 *
 * A separate user (NOT e2e-test@) on purpose: the main seeded user
 * must stay circle-less — the "circles cold-start" capture documents
 * the EmptyState every launch user sees, and Playwright runs spec
 * files in parallel, so mutating the shared user's circles would race
 * that capture.
 *
 * Seeds server-shaped docs directly (Admin SDK bypasses rules — the
 * same trust boundary the callables occupy): the space + two members,
 * the journey link, and a partner member's weekly_check_in carrying a
 * weeklyFocus, so the timeline shows the focus copy and a live
 * "Back this focus" button.
 *
 * Idempotent: deterministic doc ids; re-runs overwrite.
 *
 * Operator setup (same as seed-e2e-user.ts):
 *   firebase emulators:start --only auth,firestore
 *   export FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
 *   export FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
 *   GCLOUD_PROJECT=demo-tropos npm run seed:circles
 */
import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { assertEmulatorEnvOrExit } from "../e2e/helpers/emulator";
import { localWeekKey } from "../src/lib/dateHelpers";

assertEmulatorEnvOrExit();

export const CIRCLES_CAPTURE_USER = {
  email: "circles-capture@tropos.test",
  password: "test-password-123",
  displayName: "Circle Tester",
} as const;

const PARTNER_UID = "capture-maya";
const SPACE_ID = "capture-circle-1";

const PROJECT_ID = process.env.GCLOUD_PROJECT || "adaptive-fitness-af8bb";
if (!getApps().length) initializeApp({ projectId: PROJECT_ID });
const auth = getAuth();
const db = getFirestore();

async function ensureUser(): Promise<string> {
  try {
    const existing = await auth.getUserByEmail(CIRCLES_CAPTURE_USER.email);
    return existing.uid;
  } catch (err: unknown) {
    if ((err as { code?: string }).code !== "auth/user-not-found") throw err;
  }
  const created = await auth.createUser({
    email: CIRCLES_CAPTURE_USER.email,
    password: CIRCLES_CAPTURE_USER.password,
    displayName: CIRCLES_CAPTURE_USER.displayName,
    emailVerified: true,
  });
  return created.uid;
}

async function main() {
  const uid = await ensureUser();
  const now = Date.now();
  const weekKey = localWeekKey();

  // Minimal onboarded profile (mirrors seed-e2e-user.ts shape).
  await db
    .collection("users")
    .doc(uid)
    .set(
      {
        uid,
        displayName: CIRCLES_CAPTURE_USER.displayName,
        email: CIRCLES_CAPTURE_USER.email,
        photoURL: null,
        athleteType: "Lifter",
        weightKg: 70,
        heightCm: 170,
        weeklyWorkoutsTarget: 4,
        weeklyMealsTarget: 10,
        preferredWeightUnit: "kg",
        preferredHeightUnit: "cm",
        darkMode: false,
        onboardingComplete: true,
        subscriptionTier: "free",
        currentStreak: 0,
        longestStreak: 0,
        lastLogDate: null,
        adjustCaloriesForTraining: true,
        program: { goal: "recomp", startWeight: 70, currentPhase: "base" },
        targetCalories: 2200,
        targetProtein: 160,
        targetCarbs: 250,
        targetFat: 60,
      },
      { merge: true }
    );
  await db.collection("users").doc(uid).collection("public").doc("profile").set(
    {
      uid,
      displayName: CIRCLES_CAPTURE_USER.displayName,
      displayNameLower: CIRCLES_CAPTURE_USER.displayName.toLowerCase(),
      photoURL: null,
      athleteType: "Lifter",
      currentStreak: 0,
      longestStreak: 0,
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  // The Circle — server-shaped docs (goalSpaceMembership.js contract).
  await db.doc(`goalSpaces/${SPACE_ID}`).set({
    id: SPACE_ID,
    type: "strength_block",
    title: "Autumn Strength Crew",
    visibility: "invite_only",
    ownerId: uid,
    memberCount: 2,
    maxMembers: 8,
    targetDate: null,
    active: true,
    inviteCode: "capture-invite",
    createdAt: now - 6 * 86_400_000,
  });
  await db.doc(`goalSpaces/${SPACE_ID}/members/${uid}`).set({
    uid,
    displayName: CIRCLES_CAPTURE_USER.displayName,
    photoURL: null,
    role: "owner",
    joinedAt: now - 6 * 86_400_000,
  });
  await db.doc(`goalSpaces/${SPACE_ID}/members/${PARTNER_UID}`).set({
    uid: PARTNER_UID,
    displayName: "Maya Chen",
    photoURL: null,
    role: "member",
    joinedAt: now - 5 * 86_400_000,
  });
  await db.doc(`users/${uid}/journeys/${SPACE_ID}`).set({
    id: SPACE_ID,
    type: "strength_block",
    title: "Autumn Strength Crew",
    goalSpaceId: SPACE_ID,
    targetDate: null,
    createdAt: now - 6 * 86_400_000,
  });

  // Timeline: joined events + Maya's CURRENT-week focus check-in
  // (deterministic ${uid}_${weekKey} id — the server's shape), which
  // renders the focus copy and a live "Back this focus" button for
  // the capture user.
  await db.doc(`goalSpaces/${SPACE_ID}/events/capture-join-1`).set({
    uid,
    kind: "joined",
    text: null,
    weekKey: null,
    createdAt: now - 6 * 86_400_000,
  });
  await db.doc(`goalSpaces/${SPACE_ID}/events/capture-join-2`).set({
    uid: PARTNER_UID,
    kind: "joined",
    text: null,
    weekKey: null,
    createdAt: now - 5 * 86_400_000,
  });
  await db.doc(`goalSpaces/${SPACE_ID}/events/${PARTNER_UID}_${weekKey}`).set({
    uid: PARTNER_UID,
    kind: "weekly_check_in",
    text: null,
    weekKey,
    weeklyFocus: "running",
    supporterIds: [],
    createdAt: now - 2 * 3_600_000,
  });
  await db.doc(`goalSpaces/${SPACE_ID}/events/capture-milestone-1`).set({
    uid: PARTNER_UID,
    kind: "milestone",
    text: "First 5k under 30",
    weekKey: null,
    createdAt: now - 26 * 3_600_000,
  });

  console.log(
    `[seed-circles-capture] Done — ${CIRCLES_CAPTURE_USER.email} owns ${SPACE_ID} (week ${weekKey}).`
  );
}

main().catch((err) => {
  console.error("[seed-circles-capture] Failed:", err);
  process.exit(1);
});
