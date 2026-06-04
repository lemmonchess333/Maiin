/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { format } from "date-fns";

// Mock framer-motion to render plain divs
vi.mock("framer-motion", function () {
  return {
    get m() {
      return (this as { motion: unknown }).motion;
    },
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
              variants: _v,
              whileTap: _w,
              ...rest
            } = props;
            const Tag = prop === "create" ? "div" : prop;
            return <Tag {...rest} />;
          };
        },
      }
    ),
    AnimatePresence: function ({ children }: any) {
      return children;
    },
  };
});

vi.mock("@/lib/theme", function () {
  return { THEME: { brand: "#7B72E9" } };
});

vi.mock("lucide-react", function () {
  return {
    X: function (props: any) {
      return <svg data-testid="x-icon" {...props} />;
    },
  };
});

import WelcomeBackCard from "../WelcomeBackCard";

describe("WelcomeBackCard", function () {
  const todayKey = format(new Date(), "yyyy-MM-dd");
  const storageKey = "wb-dismissed-" + todayKey;

  beforeEach(function () {
    localStorage.clear();
  });

  it("renders welcome message", function () {
    render(<WelcomeBackCard />);
    expect(
      screen.getByText("Welcome back! Pick up where you left off.")
    ).toBeInTheDocument();
  });

  it("renders dismiss button with accessible label", function () {
    render(<WelcomeBackCard />);
    expect(
      screen.getByLabelText("Dismiss welcome message")
    ).toBeInTheDocument();
  });

  it("dismisses on button click and sets localStorage", function () {
    render(<WelcomeBackCard />);
    fireEvent.click(screen.getByLabelText("Dismiss welcome message"));
    expect(
      screen.queryByText("Welcome back! Pick up where you left off.")
    ).not.toBeInTheDocument();
    expect(localStorage.getItem(storageKey)).toBe("1");
  });

  it("does not render when already dismissed in localStorage", function () {
    localStorage.setItem(storageKey, "1");
    const { container } = render(<WelcomeBackCard />);
    expect(container.innerHTML).toBe("");
  });

  it("renders when a different day was dismissed", function () {
    localStorage.setItem("wb-dismissed-2020-01-01", "1");
    render(<WelcomeBackCard />);
    expect(
      screen.getByText("Welcome back! Pick up where you left off.")
    ).toBeInTheDocument();
  });
});
