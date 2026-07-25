/**
 * Drawer post-unmount timer flush (the CI "unhandled dispatchEvent" flake).
 *
 * CI's unit job went red while reporting 5385/5385 tests PASSING. The
 * red came from an unhandled error after the run:
 *
 *   TypeError: Failed to execute 'dispatchEvent' on 'EventTarget':
 *   parameter 1 is not of type 'Event'
 *     at @radix-ui/react-focus-scope (Timeout._onTimeout)
 *
 * Mechanism: vaul's Drawer wraps Radix Dialog, whose FocusScope defers
 * its close handling to a `setTimeout(…, 0)` scheduled in the effect
 * CLEANUP — one macrotask AFTER unmount:
 *
 *   return () => { … setTimeout(() => {
 *     const unmountEvent = new CustomEvent(AUTOFOCUS_ON_UNMOUNT, …);
 *     container.dispatchEvent(unmountEvent);        // ← the hazard
 *   }, 0); };
 *
 * If a file ends with that timer pending, Vitest swaps the jsdom realm
 * first. The callback then builds its CustomEvent from the NEW realm and
 * dispatches it on a container from the OLD one, and jsdom's IDL
 * conversion rejects the cross-realm event with exactly that message.
 *
 * The fix: Drawer-mounting suites yield one macrotask in their afterEach
 * (see `CirclesSection.invite.test.tsx`) so the timer runs inside its
 * own realm. THIS suite pins the load-bearing assumption behind that
 * fix: that a single macrotask is enough. If a future vaul/Radix bump
 * moves the work to a longer timer, a different scheduler, or several
 * chained ticks, those drains would silently stop working and the flake
 * would come back as a mystery — this fails loudly instead.
 *
 * Scoped per-file rather than globally on purpose: a global afterEach
 * flush was tried first and regressed `Tooltip.test.tsx`, because
 * letting deferred work run after cleanup can strand a portal node in
 * document.body for the next test's `screen` query to find.
 *
 * It deliberately probes via `onCloseAutoFocus`, which Radix invokes by
 * dispatching AUTOFOCUS_ON_UNMOUNT — i.e. the very dispatchEvent call
 * that throws when it lands cross-realm. Observing that handler is as
 * close to the failure site as an in-suite test can get: the error
 * itself happens BETWEEN files, in the runner, after the environment is
 * already gone, so it can't be asserted on directly.
 */
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { Drawer } from "vaul";

function OpenDrawer({ onCloseAutoFocus }: { onCloseAutoFocus: () => void }) {
  return (
    <Drawer.Root open onOpenChange={() => {}}>
      <Drawer.Portal>
        <Drawer.Overlay />
        <Drawer.Content onCloseAutoFocus={onCloseAutoFocus}>
          <Drawer.Title>Flush probe</Drawer.Title>
          <Drawer.Description>Post-unmount timer probe</Drawer.Description>
          <button type="button">Inside the drawer</button>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

/** One macrotask — exactly what the global afterEach in setup.ts yields. */
const oneMacrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("vaul Drawer — deferred post-unmount focus work", () => {
  it("is deferred past unmount, then runs within ONE macrotask", async () => {
    const onCloseAutoFocus = vi.fn();
    const { unmount } = render(
      <OpenDrawer onCloseAutoFocus={onCloseAutoFocus} />
    );

    unmount();
    // Deferred, not synchronous — this is why a file can end with the
    // timer still pending and take the realm down with it.
    expect(onCloseAutoFocus).not.toHaveBeenCalled();

    await oneMacrotask();

    // Fired in-realm. One macrotask is sufficient, so the setup.ts
    // flush drains it.
    expect(onCloseAutoFocus).toHaveBeenCalledTimes(1);
  });

  it("drains on every cycle when a file mounts/unmounts repeatedly", async () => {
    // The shape that made the real flake likely: each unmount queues
    // another deferred dispatch, so a file ending mid-cycle leaves one
    // pending.
    for (let i = 0; i < 3; i++) {
      const onCloseAutoFocus = vi.fn();
      const { unmount } = render(
        <OpenDrawer onCloseAutoFocus={onCloseAutoFocus} />
      );
      unmount();
      await oneMacrotask();
      expect(onCloseAutoFocus).toHaveBeenCalledTimes(1);
    }
  });
});
