import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { activeTabForPath } from "@/lib/activeTab";

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.closest('[contenteditable="true"], [role="textbox"]') !== null;
}

function hasOpenModal(): boolean {
  return (
    document.querySelector(
      '[role="dialog"], [role="alertdialog"], [aria-modal="true"]'
    ) !== null
  );
}

/**
 * Keyboard shortcuts (1–5) for jumping between the primary navigation tabs on
 * desktop without hijacking text entry, browser shortcuts, or open modals.
 */
export function useDesktopNavShortcuts(
  orderedRoutes: readonly string[],
  currentPath: string,
  enabled: boolean
): void {
  const navigate = useNavigate();

  useEffect(() => {
    if (!enabled || orderedRoutes.length === 0) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.shiftKey
      ) {
        return;
      }
      if (isEditableTarget(event.target) || hasOpenModal()) return;

      const index = Number(event.key) - 1;
      if (
        !Number.isInteger(index) ||
        index < 0 ||
        index >= orderedRoutes.length ||
        event.key.length !== 1
      ) {
        return;
      }

      const destination = orderedRoutes[index];
      if (!destination || activeTabForPath(currentPath) === destination) return;

      event.preventDefault();
      navigate(destination);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, orderedRoutes, currentPath, navigate]);
}
