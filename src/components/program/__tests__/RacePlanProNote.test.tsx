import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import RacePlanProNote from "../RacePlanProNote";

afterEach(cleanup);

describe("RacePlanProNote (whole-app grill Q85)", () => {
  it("tells a free account choosing a half or full marathon", () => {
    for (const distance of ["half", "marathon"]) {
      render(<RacePlanProNote distance={distance} isPro={false} />);
      expect(
        screen.getByText(/Half and full marathon plans are part of Pro/)
      ).toBeInTheDocument();
      cleanup();
    }
  });

  it("says nothing for a 5K or 10K, or to Pro", () => {
    const { container } = render(
      <RacePlanProNote distance="10k" isPro={false} />
    );
    expect(container).toBeEmptyDOMElement();
    cleanup();
    const pro = render(<RacePlanProNote distance="marathon" isPro />);
    expect(pro.container).toBeEmptyDOMElement();
  });
});
