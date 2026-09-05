/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";

vi.mock("framer-motion", function () {
  return {
    motion: new Proxy(
      {},
      {
        get: function (_target: any, prop: string) {
          return function (props: any) {
            const {
              initial: _i,
              animate: _a,
              exit: _e,
              transition: _t,
              ...rest
            } = props;
            const Tag = prop === "create" ? "div" : prop;
            return <Tag {...rest} />;
          };
        },
      }
    ),
    AnimatePresence: function ({ children }: any) {
      return <>{children}</>;
    },
  };
});

vi.mock("@/hooks/useReducedMotion", function () {
  return {
    useReducedMotion: function () {
      return false;
    },
  };
});

let mockIsOnline = true;
vi.mock("@/hooks/useOnlineStatus", function () {
  return {
    useOnlineStatus: function () {
      return { isOnline: mockIsOnline, wasOffline: false };
    },
  };
});

import SettingsOfflineBanner from "../SettingsOfflineBanner";

describe("SettingsOfflineBanner", function () {
  beforeEach(function () {
    vi.useFakeTimers();
    mockIsOnline = true;
  });
  afterEach(function () {
    vi.useRealTimers();
  });

  it("does not render when online", function () {
    mockIsOnline = true;
    render(<SettingsOfflineBanner />);
    expect(
      screen.queryByText(/Preference changes save on this device/i)
    ).toBeNull();
  });

  it("does not render in the first 30 seconds after going offline", function () {
    mockIsOnline = false;
    render(<SettingsOfflineBanner />);
    act(function () {
      vi.advanceTimersByTime(29_000);
    });
    expect(
      screen.queryByText(/Preference changes save on this device/i)
    ).toBeNull();
  });

  it("renders its page-specific copy once the disconnect has lasted 30 seconds", function () {
    mockIsOnline = false;
    render(<SettingsOfflineBanner />);
    act(function () {
      vi.advanceTimersByTime(30_000);
    });
    expect(
      screen.getByText(/Preference changes save on this device/i)
    ).toBeInTheDocument();
  });
});
