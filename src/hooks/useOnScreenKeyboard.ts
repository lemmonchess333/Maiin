import { useEffect, useState } from "react";
import { isNativePlatform } from "@/lib/platform";

/**
 * Whether the phone's keyboard is up for a field on the page: a text field
 * has focus, on the iPhone app or a touch screen.
 *
 * The tab bar is fixed to the foot of the screen, and with the keyboard up
 * the iPhone app's web view ends at the keyboard, so the bar rode on top of
 * it over the form being typed in (the max heart rate field in Settings →
 * Run plan, owner's recording, 23 November 2026). Layout hides the bar
 * while this is true. Focus is the signal because it works the same in
 * the app's web view and a phone's browser without a keyboard plugin: the
 * iPhone app does not shrink `visualViewport` for the keyboard
 * (`useKeyboardInset`), and a field with focus on a phone is a keyboard.
 * A computer's browser keeps its tab bar, since it has no keyboard to show.
 */
export function useOnScreenKeyboard(): boolean {
  const [up, setUp] = useState(false);
  useEffect(() => {
    if (!hasOnScreenKeyboard()) return;
    const update = () => setUp(bringsKeyboard(document.activeElement));
    const onFocusOut = (event: FocusEvent) =>
      // Moving from one field to the next keeps the keyboard up.
      setUp(bringsKeyboard(event.relatedTarget as Element | null));
    update();
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, []);
  return up;
}

/** The iPhone app, or a browser on a touch screen. */
function hasOnScreenKeyboard(): boolean {
  if (isNativePlatform()) return true;
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches
  );
}

/** Input types the phone answers with a keyboard. A date or time field
 *  gets a picker, and a checkbox, radio or slider nothing. */
const KEYBOARD_INPUT_TYPES = new Set([
  "text",
  "search",
  "email",
  "tel",
  "url",
  "password",
  "number",
]);

/** Whether focusing `el` puts the keyboard up. */
export function bringsKeyboard(el: Element | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.inputMode === "none") return false;
  if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled;
  if (el instanceof HTMLInputElement)
    return !el.readOnly && !el.disabled && KEYBOARD_INPUT_TYPES.has(el.type);
  return el.isContentEditable === true;
}
