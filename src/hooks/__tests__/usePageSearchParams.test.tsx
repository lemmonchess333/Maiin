import { describe, it, expect } from "vitest";
import { useEffect } from "react";
import { act, render, screen } from "@testing-library/react";
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useSearchParams,
  type SetURLSearchParams,
} from "react-router-dom";
import { usePageSearchParams } from "../usePageSearchParams";

/**
 * Train mirrors its day into the URL from effects. A write that landed
 * after the person had tapped another tab, while Train was still mounted
 * through the navigation's transition, took them back to Train.
 */

const page: { write: SetURLSearchParams; leave: () => void } = {
  write: () => {},
  leave: () => {},
};

function Page({ guarded }: { guarded: boolean }) {
  const [, setOnPage] = usePageSearchParams();
  const [, setPlain] = useSearchParams();
  const navigate = useNavigate();
  useEffect(() => {
    page.write = guarded ? setOnPage : setPlain;
    page.leave = () => navigate("/");
  }, [guarded, setOnPage, setPlain, navigate]);
  return null;
}

function Where() {
  const { pathname, search } = useLocation();
  return <p data-testid="where">{pathname + search}</p>;
}

function renderPage(guarded: boolean) {
  render(
    <MemoryRouter initialEntries={["/program?day=1"]}>
      <Routes>
        <Route
          path="/program"
          element={
            <>
              <Page guarded={guarded} />
              <Where />
            </>
          }
        />
        <Route path="/" element={<Where />} />
      </Routes>
    </MemoryRouter>
  );
}

const setDay = (n: number) =>
  page.write(
    (prev) => {
      const next = new URLSearchParams(prev);
      next.set("day", String(n));
      return next;
    },
    { replace: true }
  );

describe("usePageSearchParams", () => {
  it("writes the page's query while the person is on it", () => {
    renderPage(true);
    act(() => setDay(3));
    expect(screen.getByTestId("where").textContent).toBe("/program?day=3");
  });

  it("drops a write that comes after the person has left", () => {
    renderPage(true);
    act(() => {
      page.leave();
      setDay(3);
    });
    expect(screen.getByTestId("where").textContent).toBe("/");
  });

  it("is needed: the plain setter takes the person back", () => {
    renderPage(false);
    act(() => {
      page.leave();
      setDay(3);
    });
    expect(screen.getByTestId("where").textContent).toBe("/program?day=3");
  });

  it("holds the basename the browser's history carries", () => {
    render(
      <MemoryRouter basename="/Maiin" initialEntries={["/Maiin/program?day=1"]}>
        <Routes>
          <Route
            path="/program"
            element={
              <>
                <Page guarded />
                <Where />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    );
    act(() => setDay(2));
    expect(screen.getByTestId("where").textContent).toBe("/program?day=2");
  });
});
