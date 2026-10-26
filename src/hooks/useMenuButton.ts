import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

const ITEMS = '[role="menuitem"]:not([disabled])';

/**
 * A button that opens a menu of actions, as a screen reader and a
 * keyboard expect one to behave (the WAI-ARIA menu button):
 *
 *   - the button says it opens a menu and whether the menu is open;
 *   - opening it puts focus on the first item, and the arrow keys, Home
 *     and End move between items;
 *   - Escape, or a tap outside, closes it and puts focus back on the
 *     button; Tab closes it and carries on to the next control;
 *   - choosing an item closes the menu with focus back on the button
 *     before the item acts, so a dialog the item opens returns focus to
 *     the button when it closes, not to an item that has gone.
 *
 * The caller draws the menu: `buttonProps` on the button, `menuProps` on
 * the list, `itemProps` on each item, `choose` around each item's action,
 * and `close` on a backdrop, which should not be a control of its own.
 */
export function useMenuButton() {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonId = useId();
  const menuId = useId();

  const items = () =>
    Array.from(menuRef.current?.querySelectorAll<HTMLElement>(ITEMS) ?? []);

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>(ITEMS)?.focus();
  }, [open]);

  const close = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };

  const onMenuKeyDown = (event: KeyboardEvent) => {
    const list = items();
    if (list.length === 0) return;
    const at = list.indexOf(document.activeElement as HTMLElement);
    const move = (to: number) => {
      event.preventDefault();
      list[(to + list.length) % list.length].focus();
    };
    switch (event.key) {
      case "ArrowDown":
        return move(at + 1);
      case "ArrowUp":
        return move(at - 1);
      case "Home":
        return move(0);
      case "End":
        return move(list.length - 1);
      case "Escape":
        event.preventDefault();
        return close();
      case "Tab":
        return setOpen(false);
    }
  };

  return {
    open,
    close,
    choose: (action: () => void) => () => {
      close();
      action();
    },
    buttonProps: {
      ref: buttonRef,
      id: buttonId,
      "aria-haspopup": "menu" as const,
      "aria-expanded": open,
      "aria-controls": open ? menuId : undefined,
      onClick: () => setOpen((was) => !was),
    },
    menuProps: {
      ref: menuRef,
      id: menuId,
      role: "menu" as const,
      "aria-labelledby": buttonId,
      onKeyDown: onMenuKeyDown,
    },
    itemProps: { role: "menuitem" as const, tabIndex: -1 },
  };
}
