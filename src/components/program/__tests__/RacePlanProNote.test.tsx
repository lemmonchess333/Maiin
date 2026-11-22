import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import RacePlanProNote from "../RacePlanProNote";

afterEach(cleanup);

describe("RacePlanProNote (whole-app grill Q85, Run27 (18))", () => {
  it("tells a free account choosing a half, a marathon or an ultra", () => {
    // Run27 (18): the ultras are Pro after week 1, as the half and the
    // marathon are, so the note words the rule to cover them.
    for (const distance of ["half", "marathon", "50k", "50mi", "100k"]) {
      render(<RacePlanProNote distance={distance} isPro={false} />);
      expect(
        screen.getByText(/Plans for a half marathon or longer are part of Pro/)
      ).toBeInTheDocument();
      cleanup();
    }
  });

  it("tells an account that has had its free week a new plan is Pro from its start", () => {
    render(<RacePlanProNote distance="half" isPro={false} freeWeekUsed />);
    expect(
      screen.getByText(
        "Plans for a half marathon or longer are part of Pro, and you’ve had your free week. 5K and 10K plans stay free."
      )
    ).toBeInTheDocument();
    cleanup();
    render(<RacePlanProNote distance="half" isPro={false} />);
    expect(
      screen.getByText(
        "Plans for a half marathon or longer are part of Pro after their first week. 5K and 10K plans stay free."
      )
    ).toBeInTheDocument();
  });

  it("says nothing for a 5K or 10K, or to Pro", () => {
    const { container } = render(
      <RacePlanProNote distance="10k" isPro={false} />
    );
    expect(container).toBeEmptyDOMElement();
    cleanup();
    const pro = render(<RacePlanProNote distance="marathon" isPro />);
    expect(pro.container).toBeEmptyDOMElement();
    cleanup();
    const proUltra = render(<RacePlanProNote distance="50k" isPro />);
    expect(proUltra.container).toBeEmptyDOMElement();
  });
});
