/**
 * The welcome screen's photographs and how long each holds
 * (`WelcomePhotos.tsx`; the files and their rules are in src/assets/welcome).
 */
import sprint from "@/assets/welcome/welcome-1-sprint.webp";
import squat from "@/assets/welcome/welcome-2-squat.webp";
import crew from "@/assets/welcome/welcome-3-crew.webp";
import pullUp from "@/assets/welcome/welcome-4-pull-up.webp";
import runner from "@/assets/welcome/welcome-5-runner.webp";

/**
 * The welcome's photographs, in the order they play: running and lifting
 * in turn, women and men (owner, 2026-11-12; src/assets/welcome/README.md).
 *
 * `focus` is the photograph's `object-position`. Each file is 9:19.5, the
 * shape of a full-screen iPhone, so a tall phone shows all of it; a
 * shorter screen (an iPhone SE is 9:16) keeps less of the height, and the
 * focus chooses which part, so the face stays between the name at the top
 * and the headline, which sits at about half a short screen's height.
 */
export const WELCOME_PHOTOS: readonly { src: string; focus: string }[] = [
  { src: sprint, focus: "50% 15%" },
  { src: squat, focus: "50% 40%" },
  { src: crew, focus: "50% 45%" },
  { src: pullUp, focus: "50% 30%" },
  { src: runner, focus: "50% 45%" },
];

/** How long each photograph holds before the next fades in. */
export const WELCOME_PHOTO_HOLD_MS = 4500;
