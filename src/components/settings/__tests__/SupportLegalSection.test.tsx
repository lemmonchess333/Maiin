import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import SupportLegalSection from "../SupportLegalSection";
import { guideRequest } from "@/lib/firstGuide";

function HomeProbe() {
  const location = useLocation();
  return (
    <output aria-label="Home asked for">
      {guideRequest(location.state) ?? "nothing"}
    </output>
  );
}

describe("SupportLegalSection — Show me around", () => {
  it("takes you to Home asking for the first-visit walk", () => {
    render(
      <MemoryRouter initialEntries={["/settings/support-legal"]}>
        <Routes>
          <Route
            path="/settings/support-legal"
            element={<SupportLegalSection inline />}
          />
          <Route path="/" element={<HomeProbe />} />
        </Routes>
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole("link", { name: /Show me around/ }));
    expect(screen.getByLabelText("Home asked for")).toHaveTextContent("walk");
  });
});
