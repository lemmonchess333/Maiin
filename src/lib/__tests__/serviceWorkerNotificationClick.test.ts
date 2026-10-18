import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

type AppWindow = {
  url: string;
  navigate?: (url: string) => Promise<unknown>;
  focus: () => Promise<unknown>;
};

function loadWorker(filename: string, base: string, windows: AppWindow[] = []) {
  const listeners = new Map<string, (event: unknown) => void>();
  const openWindow = vi.fn().mockResolvedValue(undefined);
  runInNewContext(
    readFileSync(
      fileURLToPath(new URL(`../../../public/${filename}`, import.meta.url)),
      "utf8"
    ),
    {
      self: {
        location: new URL(`https://app.example${base}${filename}`),
        addEventListener: (type: string, listener: (event: unknown) => void) =>
          listeners.set(type, listener),
      },
      clients: { matchAll: vi.fn().mockResolvedValue(windows), openWindow },
      URL,
      console,
      importScripts: vi.fn(),
      firebase: {
        initializeApp: vi.fn(),
        messaging: () => ({ onBackgroundMessage: vi.fn() }),
      },
    }
  );
  const click = listeners.get("notificationclick");
  if (!click)
    throw new Error("Worker did not install a notification click handler");
  return {
    openWindow,
    async tap(route: unknown) {
      let pending: Promise<unknown> | undefined;
      const close = vi.fn();
      click({
        notification: { data: { route }, close },
        waitUntil: (operation: Promise<unknown>) => {
          pending = operation;
        },
      });
      await pending;
      expect(close).toHaveBeenCalledOnce();
    },
  };
}

describe.each(["sw.js", "firebase-messaging-sw.js"])(
  "%s push taps",
  (filename) => {
    it("navigates an existing app window to Together before focusing it", async () => {
      const order: string[] = [];
      const focus = vi.fn(async () => {
        order.push("focus");
      });
      const navigate = vi.fn(async () => {
        order.push("navigate");
      });
      const worker = loadWorker(filename, "/", [
        { url: "https://app.example/social?tab=feed", navigate, focus },
      ]);
      await worker.tap("/social");
      expect(navigate).toHaveBeenCalledWith(
        "https://app.example/social?tab=together"
      );
      expect(order).toEqual(["navigate", "focus"]);
      expect(worker.openWindow).not.toHaveBeenCalled();
    });

    it("opens the destination with the hosted subpath when no app window exists", async () => {
      const worker = loadWorker(filename, "/Maiin/");
      await worker.tap("/social");
      expect(worker.openWindow).toHaveBeenCalledWith(
        "https://app.example/Maiin/social?tab=together"
      );
    });

    it("does not navigate windows outside its origin and app scope", async () => {
      const navigate = vi.fn();
      const focus = vi.fn();
      const worker = loadWorker(filename, "/Maiin/", [
        { url: "https://other.example/Maiin/", navigate, focus },
        { url: "https://app.example/another/Maiin/", navigate, focus },
      ]);
      await worker.tap("/program");
      expect(navigate).not.toHaveBeenCalled();
      expect(focus).not.toHaveBeenCalled();
      expect(worker.openWindow).toHaveBeenCalledWith(
        "https://app.example/Maiin/program"
      );
    });

    it.each([
      "https://other.example/",
      "//other.example/",
      "/../outside",
      "/unrelated",
      null,
    ])("uses the app home for an untrusted route %s", async (route) => {
      const worker = loadWorker(filename, "/Maiin/");
      await worker.tap(route);
      expect(worker.openWindow).toHaveBeenCalledWith(
        "https://app.example/Maiin/"
      );
    });

    it("opens the destination if an existing window can no longer navigate", async () => {
      const focus = vi.fn();
      const worker = loadWorker(filename, "/", [
        {
          url: "https://app.example/",
          navigate: vi.fn().mockRejectedValue(new Error("Window closed")),
          focus,
        },
      ]);
      await worker.tap("/social");
      expect(focus).not.toHaveBeenCalled();
      expect(worker.openWindow).toHaveBeenCalledWith(
        "https://app.example/social?tab=together"
      );
    });
  }
);

describe.each(["sw.js", "firebase-messaging-sw.js"])(
  "%s push display lifetime",
  (filename) => {
    it("returns the display promise so Firebase keeps the push alive until notification display", async () => {
      let finishDisplay: () => void = () => {
        throw new Error("Display was not started");
      };
      const display = new Promise<void>((resolve) => {
        finishDisplay = resolve;
      });
      const showNotification = vi.fn().mockReturnValue(display);
      let background: ((payload: unknown) => Promise<void>) | undefined;
      const params = new URLSearchParams({
        apiKey: "test-public-key",
        projectId: "test-project",
        messagingSenderId: "test-sender",
        appId: "test-app",
      });
      runInNewContext(
        readFileSync(
          fileURLToPath(
            new URL(`../../../public/${filename}`, import.meta.url)
          ),
          "utf8"
        ),
        {
          self: {
            location: new URL(`https://app.example/${filename}?${params}`),
            addEventListener: vi.fn(),
            registration: { showNotification },
          },
          URL,
          console,
          importScripts: vi.fn(),
          firebase: {
            initializeApp: vi.fn(),
            messaging: () => ({
              onBackgroundMessage: (
                callback: (payload: unknown) => Promise<void>
              ) => {
                background = callback;
              },
            }),
          },
        }
      );
      if (!background)
        throw new Error("Worker did not install a background handler");
      const data = {
        title: "New monthly challenge",
        body: "A new goal is ready",
        route: "/social",
      };
      const pending = background({ data });
      expect(pending).toBe(display);
      expect(showNotification).toHaveBeenCalledWith(
        "New monthly challenge",
        expect.objectContaining({
          body: data.body,
          data,
        })
      );
      let completed = false;
      void pending.then(() => {
        completed = true;
      });
      await Promise.resolve();
      expect(completed).toBe(false);
      finishDisplay();
      await pending;
      expect(completed).toBe(true);
    });
  }
);
