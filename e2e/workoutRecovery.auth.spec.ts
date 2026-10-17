import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { openSignInForm, TEST_USER } from "./helpers/auth";
import { emulatorActive } from "./helpers/emulator";
import { emulatorAdmin } from "./helpers/realCallables";
import { settleFullPageHeight } from "./helpers/settleHeight";
import { settleImages } from "./helpers/settleImages";
import { WORKOUT } from "../src/test/journeyScreens";
import type { WorkoutExercise } from "../src/lib/savedWorkouts";

test.skip(!emulatorActive, "Requires the local Auth/Firestore emulators");
test.setTimeout(150_000);
test.use({
  viewport: { width: 393, height: 852 },
  timezoneId: "UTC",
  contextOptions: { reducedMotion: "reduce" },
});

async function account(label: string) {
  expect(
    emulatorActive,
    "Only disposable local emulator accounts may be used"
  ).toBe(true);
  const { auth, db, Timestamp } = emulatorAdmin();
  const seedUser = await auth.getUserByEmail(TEST_USER.email);
  const seed = (await db.doc(`users/${seedUser.uid}`).get()).data();
  expect(seed?.onboardingComplete).toBe(true);
  const email = `strength-${randomUUID()}@tropos.test`;
  const user = await auth.createUser({
    email,
    password: TEST_USER.password,
    emailVerified: true,
  });
  const profile = db.doc(`users/${user.uid}`);
  const routineId = "recovery-contract";
  await profile.set({
    ...seed,
    uid: user.uid,
    email,
    displayName: label,
    subscriptionTier: "free",
    autoRestTimer: false,
    liftingWeightUnit: "kg",
    darkMode: false,
  });
  await profile.collection("public").doc("profile").set({
    uid: user.uid,
    displayName: label,
    displayNameLower: label.toLowerCase(),
    athleteType: "Lifter",
    photoURL: null,
  });
  await profile
    .collection("savedRoutines")
    .doc(routineId)
    .set({
      name: label,
      sourceActivityId: "disposable-browser-fixture",
      sourceAuthorId: user.uid,
      sourceAuthorName: label,
      createdAt: Timestamp.now(),
      exercises: [
        {
          name: "Push-Ups",
          exerciseId: "push-ups",
          summary: "3×8",
          setCount: 3,
          targetReps: 8,
          targetWeightKg: 0,
        },
      ],
    });
  return {
    auth,
    db,
    user,
    email,
    profile,
    routineId,
    workouts: profile.collection("workouts"),
  };
}

async function signInAndOpen(
  page: Page,
  owner: Awaited<ReturnType<typeof account>>
) {
  // Firebase adds this local-emulator-only fixed strip over the real
  // bottom CTA. Match the existing browser fixtures without forced clicks.
  await page.addInitScript(() =>
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.textContent = ".firebase-emulator-warning{display:none!important}";
      document.head.append(style);
    })
  );
  await page.goto("./");
  await openSignInForm(page);
  await page.locator("#login-email").fill(owner.email);
  await page.locator("#login-password").fill(TEST_USER.password);
  await page.locator('button[type="submit"]').first().click();
  await expect(
    page.getByRole("navigation", { name: "Main navigation", exact: true })
  ).toBeVisible({ timeout: 20_000 });
  await page.goto(`routine/${owner.routineId}`);
  await expect(
    page.getByRole("button", { name: WORKOUT.close, exact: true })
  ).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("[data-set-row]")).toHaveCount(3);
}

async function draft(page: Page, uid: string) {
  return page.evaluate((owner) => {
    const prefix = `tropos_workout_draft:v2:${encodeURIComponent(owner)}:`;
    const key = Object.keys(localStorage).find((key) => key.startsWith(prefix));
    return key ? JSON.parse(localStorage.getItem(key)!) : null;
  }, uid);
}

async function leaveAndResume(page: Page, routineId: string) {
  await page.getByRole("button", { name: WORKOUT.close, exact: true }).click();
  await expect(page).toHaveURL(/\/program$/);
  await page.reload();
  await expect(
    page.getByRole("navigation", { name: "Main navigation", exact: true })
  ).toBeVisible({ timeout: 20_000 });
  await page.goto(`routine/${routineId}`);
  const prompt = page.getByRole("dialog", {
    name: "Resume workout?",
    exact: true,
  });
  await expect(prompt).toBeVisible({ timeout: 20_000 });
  await prompt.getByRole("button", { name: "Resume", exact: true }).click();
  await expect(prompt).toHaveCount(0);
}

async function completeRemainingTwo(page: Page, uid: string) {
  // The primary completion button follows the cursor, which may be on the
  // explicitly undone set. Perform ONLY the two other table rows.
  for (const index of [1, 2]) {
    await page
      .locator(`[data-set-row="${index}"]`)
      .getByRole("button", { name: "Mark set complete", exact: true })
      .click();
    // A finished exercise can replace the table with its save screen.
    // Assert the actual persisted completion instead of a vanished input.
    await expect
      .poll(async () => (await draft(page, uid))?.setLogs[0][index].completed)
      .toBe(true);
  }
}

async function save(page: Page, owner: Awaited<ReturnType<typeof account>>) {
  const saveButton = page.getByRole("button", {
    name: WORKOUT.save,
    exact: true,
  });
  const finishButton = page.getByRole("button", {
    name: "Finish workout",
    exact: true,
  });
  await expect(saveButton.or(finishButton)).toBeVisible({ timeout: 20_000 });
  if (!(await saveButton.isVisible())) {
    await finishButton.click();
    await page
      .getByRole("alertdialog", { name: "Finish early?", exact: true })
      .getByRole("button", { name: "Finish", exact: true })
      .click();
  }
  await expect(saveButton).toBeVisible();
  await saveButton.click();
  await expect(
    page.getByRole("button", { name: WORKOUT.done, exact: true })
  ).toBeVisible({ timeout: 20_000 });
  await expect
    .poll(async () => (await owner.workouts.get()).size, { timeout: 20_000 })
    .toBe(1);
  const docs = (await owner.workouts.get()).docs;
  const data = docs[0].data() as { exercises: WorkoutExercise[] };
  return { id: docs[0].id, ...data };
}

async function evidence(info: TestInfo, name: string, value: unknown) {
  const path = info.outputPath(`${name}.json`);
  await writeFile(path, JSON.stringify(value, null, 2));
  await info.attach(name, { path, contentType: "application/json" });
}

test("an undone set stays unperformed after leaving and resuming, and only the other two sets reach the server", async ({
  page,
  context,
  browserName,
}, info) => {
  const owner = await account("Strength undo recovery");
  try {
    await signInAndOpen(page, owner);
    await page
      .getByRole("button", { name: "Complete set 1", exact: true })
      .click();
    await expect
      .poll(
        async () => (await draft(page, owner.user.uid))?.setLogs[0][0].completed
      )
      .toBe(true);
    const beforeUndo = await draft(page, owner.user.uid);
    await page
      .getByRole("button", { name: "Undo last set", exact: true })
      .click();
    await expect(
      page.getByRole("spinbutton", { name: "Set 1 reps", exact: true })
    ).toBeEnabled();
    const afterUndo = await draft(page, owner.user.uid);
    await leaveAndResume(page, owner.routineId);
    const restoredFirstDisabled = await page
      .getByRole("spinbutton", { name: "Set 1 reps", exact: true })
      .isDisabled();
    const restoredDraft = await draft(page, owner.user.uid);
    await completeRemainingTwo(page, owner.user.uid);
    const saved = await save(page, owner);
    await evidence(info, "undo-recovery-server-record", {
      browserName,
      beforeUndo,
      afterUndo,
      restoredFirstDisabled,
      restoredDraft,
      saved,
    });
    await settleImages(page);
    await settleFullPageHeight(page);
    await page.screenshot({
      path: info.outputPath("saved-strength-summary.png"),
      animations: "disabled",
      fullPage: true,
    });
    expect(saved.exercises).toHaveLength(1);
    expect(saved.exercises[0].exerciseId).toBe("push-ups");
    expect(
      saved.exercises[0].sets,
      "The explicitly undone first set was never performed again"
    ).toHaveLength(2);
    expect(
      saved.exercises[0].sets.map((set: { reps: number }) => set.reps)
    ).toEqual([8, 8]);
    expect(restoredFirstDisabled).toBe(false);
    expect(await draft(page, owner.user.uid)).toBeNull();
  } finally {
    await context.close();
    try {
      await owner.db.recursiveDelete(owner.profile);
    } finally {
      await owner.auth.deleteUser(owner.user.uid);
    }
  }
});

test("control: a corrected completed set survives leaving and resuming and saves all three performed sets", async ({
  page,
  context,
  browserName,
}, info) => {
  const owner = await account("Strength correction recovery");
  try {
    await signInAndOpen(page, owner);
    await page
      .getByRole("button", { name: "Complete set 1", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Edit completed set 1", exact: true })
      .click();
    const sheet = page.getByRole("dialog", { name: "Edit set 1", exact: true });
    await sheet.getByRole("textbox", { name: "Reps", exact: true }).fill("6");
    await sheet
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(sheet).toHaveCount(0);
    await expect
      .poll(async () => (await draft(page, owner.user.uid))?.setLogs[0][0].reps)
      .toBe(6);
    await leaveAndResume(page, owner.routineId);
    await expect(
      page.getByRole("spinbutton", { name: "Set 1 reps", exact: true })
    ).toBeDisabled();
    await expect(
      page.getByRole("spinbutton", { name: "Set 1 reps", exact: true })
    ).toHaveValue("6");
    await completeRemainingTwo(page, owner.user.uid);
    const saved = await save(page, owner);
    await evidence(info, "corrected-set-recovery-server-record", {
      browserName,
      saved,
    });
    expect(saved.exercises).toHaveLength(1);
    expect(
      saved.exercises[0].sets.map((set: { reps: number }) => set.reps)
    ).toEqual([6, 8, 8]);
    expect(await draft(page, owner.user.uid)).toBeNull();
  } finally {
    await context.close();
    try {
      await owner.db.recursiveDelete(owner.profile);
    } finally {
      await owner.auth.deleteUser(owner.user.uid);
    }
  }
});

test("the Resume prompt contains keyboard navigation and prevents background set completion", async ({
  page,
  context,
  browserName,
}, info) => {
  const owner = await account("Strength resume keyboard");
  const focused: unknown[] = [];
  const layouts: unknown[] = [];
  const issues: unknown[] = [];
  const focusEscapes: unknown[] = [];
  try {
    await signInAndOpen(page, owner);
    await page
      .getByRole("button", { name: "Complete set 1", exact: true })
      .click();
    await expect
      .poll(
        async () => (await draft(page, owner.user.uid))?.setLogs[0][0].completed
      )
      .toBe(true);
    await page
      .getByRole("button", { name: WORKOUT.close, exact: true })
      .click();
    await expect(page).toHaveURL(/\/program$/);
    await page.reload();
    await expect(
      page.getByRole("navigation", { name: "Main navigation", exact: true })
    ).toBeVisible({ timeout: 20_000 });
    await page.goto(`routine/${owner.routineId}`);
    const prompt = page.getByRole("dialog", {
      name: "Resume workout?",
      exact: true,
    });
    await expect(prompt).toBeVisible({ timeout: 20_000 });
    await expect(prompt).toHaveAttribute("aria-modal", "true");
    await expect(
      prompt.getByRole("button", { name: "Resume", exact: true })
    ).toBeFocused();
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    const before = await draft(page, owner.user.uid);
    for (const width of [320, 393]) {
      await page.setViewportSize({ width, height: 852 });
      for (const dark of [false, true]) {
        await page.evaluate((isDark) => {
          document.documentElement.classList.toggle("dark", isDark);
          document.documentElement.style.fontSize = "200%";
        }, dark);
        await settleImages(page);
        await settleFullPageHeight(page);
        const positions: unknown[] = [];
        for (const name of ["Resume", "Start fresh"]) {
          const button = prompt.getByRole("button", { name, exact: true });
          await button.scrollIntoViewIfNeeded();
          await expect(button).toBeVisible();
          const measured = await button.evaluate((element) => {
            const button = element as HTMLButtonElement;
            const rect = button.getBoundingClientRect();
            const dialog = button.closest('[role="dialog"]') as HTMLElement;
            const panel = dialog.getBoundingClientRect();
            const range = document.createRange();
            range.selectNodeContents(button);
            const text = range.getBoundingClientRect();
            return {
              text: button.textContent?.trim(),
              width: rect.width,
              height: rect.height,
              left: rect.left,
              right: rect.right,
              top: rect.top,
              bottom: rect.bottom,
              clientWidth: button.clientWidth,
              scrollWidth: button.scrollWidth,
              textLeft: text.left,
              textRight: text.right,
              textTop: text.top,
              textBottom: text.bottom,
              fullyVisible:
                rect.left >= Math.max(0, panel.left) - 1 &&
                rect.right <= Math.min(innerWidth, panel.right) + 1 &&
                rect.top >= Math.max(0, panel.top) - 1 &&
                rect.bottom <= Math.min(innerHeight, panel.bottom) + 1,
              textFits:
                button.scrollWidth <= button.clientWidth + 1 &&
                text.left >= rect.left - 1 &&
                text.right <= rect.right + 1 &&
                text.top >= rect.top - 1 &&
                text.bottom <= rect.bottom + 1,
            };
          });
          positions.push(measured);
          if (
            !measured.fullyVisible ||
            !measured.textFits ||
            measured.width < 44 ||
            measured.height < 44
          ) {
            issues.push({ width, dark, button: measured });
          }
        }
        const geometry = await prompt.evaluate((element) => {
          const dialog = element as HTMLElement;
          return {
            clientWidth: dialog.clientWidth,
            scrollWidth: dialog.scrollWidth,
            documentWidth: document.documentElement.scrollWidth,
            viewportWidth: innerWidth,
          };
        });
        layouts.push({ width, dark, textScale: "200%", geometry, positions });
        if (
          geometry.documentWidth > geometry.viewportWidth + 1 ||
          geometry.scrollWidth > geometry.clientWidth + 1
        ) {
          issues.push({ width, dark, geometry });
        }
        await page.screenshot({
          path: info.outputPath(
            `resume-${width}-${dark ? "dark" : "light"}-200.png`
          ),
          animations: "disabled",
          fullPage: true,
        });
      }
    }
    await page.setViewportSize({ width: 393, height: 852 });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "";
      document.documentElement.classList.remove("dark");
    });
    for (const key of [
      ...Array(12).fill("Tab"),
      ...Array(12).fill("Shift+Tab"),
    ]) {
      await page.keyboard.press(key);
      const active = await prompt.evaluate((dialog) => {
        const element = document.activeElement as HTMLElement | null;
        return {
          inside: !!element && dialog.contains(element),
          tag: element?.tagName,
          text: element?.textContent?.trim().slice(0, 80),
          label: element?.getAttribute("aria-label"),
        };
      });
      focused.push({ key, ...active });
      if (!active.inside) focusEscapes.push({ key, ...active });
    }
    const after = await draft(page, owner.user.uid);
    const promptStillVisible = await prompt.isVisible();
    await evidence(info, "resume-keyboard-containment", {
      browserName,
      namedModal: true,
      focused,
      focusEscapes,
      layouts,
      issues,
      promptStillVisible,
      before,
      after,
    });
    expect(promptStillVisible).toBe(true);
    expect(
      focusEscapes,
      "Tab and Shift+Tab stay within the Resume dialog"
    ).toEqual([]);
    expect(after.setLogs).toEqual(before.setLogs);
    expect(
      issues,
      "Resume choices stay readable and fully reachable at 200% text on both phone widths/themes"
    ).toEqual([]);
  } finally {
    await context.close();
    try {
      await owner.db.recursiveDelete(owner.profile);
    } finally {
      await owner.auth.deleteUser(owner.user.uid);
    }
  }
});
