/**
 * Save your plan (A6): the account is made at the end of setup, and this
 * is what carries setup across that moment.
 *
 * Signing in replaces the signed-out screens with the signed-in ones, so
 * setup is drawn afresh once the account exists. Its answers wait in the
 * signed-out draft (`onboardingDraft.ts`); this mark says that the sign-in
 * came from Save your plan, so the new account takes those answers and its
 * plan is built at once, with the two review answers the draft does not
 * keep (the email opt-in and a typed invite code).
 *
 * The mark is what lets a new account take answers it did not give on its
 * own: only a sign-in begun from Save your plan, within the hour, on this
 * phone. An account signed in any other way (the welcome's Sign in) starts
 * its own setup, so one person's answers, their agreement to store health
 * details among them, never reach someone else's account on a shared phone.
 *
 * An account that already has a plan keeps it (`keepExistingPlan`): the
 * answers are dropped and Home says so in one line.
 */
import { readString, remove, writeJson } from "@/lib/localStore";
import { clearSignedOutDraft } from "@/lib/onboardingDraft";

const SETUP_SAVE_KEY = "tropos.setupSave";

/** Long enough for any sign-in sheet, short enough that a mark left by a
 *  sign-in that never came back cannot hand the answers on later. */
export const SETUP_SAVE_TTL_MS = 60 * 60 * 1000;

export interface SetupSave {
  /** The review's email switch, as it was when Save your plan opened. */
  emailOptIn: boolean;
  /** The review's invite field, as typed or filled from a link. */
  inviteCode: string;
  /** When the sign-in began. */
  at: number;
}

/** Save your plan's words (A6). The buttons are the ways in's own. */
export const SAVE_PLAN_COPY = {
  title: "Save your plan",
  lead: "Create an account to keep your plan on any phone.",
  haveAccount: "Already have an account?",
  signIn: "Sign in",
  newAccount: "New to Tropos?",
  create: "Create one",
} as const;

/** One line on Home for an account that already had a plan. */
export const KEPT_PLAN_NOTICE = "You already have a plan, so we kept it.";

/** Mark a sign-in from Save your plan, just before it opens. */
export function startSetupSave(
  save: Pick<SetupSave, "emailOptIn" | "inviteCode">
): void {
  writeJson(SETUP_SAVE_KEY, {
    emailOptIn: save.emailOptIn,
    inviteCode: save.inviteCode,
    at: Date.now(),
  } satisfies SetupSave);
}

/** The sign-in was cancelled or failed: nothing is waiting for an account. */
export function cancelSetupSave(): void {
  remove(SETUP_SAVE_KEY);
}

/** The mark, while it stands; a stale or unreadable one is removed. */
export function readSetupSave(): SetupSave | null {
  const raw = readString(SETUP_SAVE_KEY);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<SetupSave> | null;
    if (
      value &&
      typeof value.emailOptIn === "boolean" &&
      typeof value.inviteCode === "string" &&
      value.inviteCode.length <= 40 &&
      typeof value.at === "number" &&
      Date.now() - value.at >= 0 &&
      Date.now() - value.at <= SETUP_SAVE_TTL_MS
    )
      return {
        emailOptIn: value.emailOptIn,
        inviteCode: value.inviteCode,
        at: value.at,
      };
  } catch {
    // Unreadable: treated as no mark.
  }
  remove(SETUP_SAVE_KEY);
  return null;
}

/** The plan is being built from the answers: the mark has done its job. */
export function finishSetupSave(): void {
  remove(SETUP_SAVE_KEY);
}

/**
 * A sign-in from Save your plan reached an account that already has a
 * plan: its plan stays, and the answers given signed out are dropped.
 * True when that happened, so the caller says so; false with no mark.
 */
export function keepExistingPlan(): boolean {
  if (!readSetupSave()) return false;
  remove(SETUP_SAVE_KEY);
  clearSignedOutDraft();
  return true;
}
