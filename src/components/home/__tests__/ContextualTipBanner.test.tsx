/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("framer-motion", () => ({
  motion: new Proxy(
    {},
    {
      get:
        (_t: any, prop: string) =>
        (props: any) => {
          const {
            initial: _i,
            animate: _a,
            exit: _e,
            transition: _tn,
            ...rest
          } = props;
          const Tag = prop === "create" ? "div" : prop;
          return <Tag {...rest} />;
        },
    },
  ),
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

vi.mock("@/hooks/useReducedMotion", () => ({
  useReducedMotion: () => false,
}));

vi.mock("@/lib/haptic", () => ({ haptic: vi.fn() }));

import ContextualTipBanner from "../ContextualTipBanner";

function renderBanner(props: {
  tipKey?: string;
  title?: string;
  description?: string;
  visible?: boolean;
}) {
  return render(
    <MemoryRouter>
      <ContextualTipBanner
        tipKey={props.tipKey ?? "test-tip"}
        title={props.title ?? "Personalise your calorie targets"}
        description={props.description ?? "Add your age and sex."}
        visible={props.visible ?? true}
      />
    </MemoryRouter>,
  );
}

describe("ContextualTipBanner", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  it("renders when visible and not dismissed", () => {
    renderBanner({});
    expect(
      screen.getByText(/Personalise your calorie targets/i),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(/Dismiss tip: Personalise/i),
    ).toBeInTheDocument();
  });

  it("does NOT render when visible is false", () => {
    renderBanner({ visible: false });
    expect(
      screen.queryByText(/Personalise your calorie targets/i),
    ).toBeNull();
  });

  it("persists dismissal in localStorage + stays hidden on re-mount", () => {
    const { unmount } = renderBanner({ tipKey: "test-tip" });
    fireEvent.click(screen.getByLabelText(/Dismiss tip/i));
    unmount();

    renderBanner({ tipKey: "test-tip" });
    expect(
      screen.queryByText(/Personalise your calorie targets/i),
    ).toBeNull();
  });

  it("dismissal is scoped per tipKey — new key reopens", () => {
    const { unmount } = renderBanner({ tipKey: "tip-a" });
    fireEvent.click(screen.getByLabelText(/Dismiss tip/i));
    unmount();

    renderBanner({ tipKey: "tip-b" });
    expect(
      screen.getByText(/Personalise your calorie targets/i),
    ).toBeInTheDocument();
  });

  it("renders the default 'Open Settings' CTA link", () => {
    renderBanner({});
    expect(
      screen.getByRole("link", { name: /Open Settings/i }),
    ).toHaveAttribute("href", "/settings");
  });
});
