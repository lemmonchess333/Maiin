/**
 * PlanPicker — the plan cards' money: the price as the plans carry it, and
 * a per-week figure worked out from that same price, in its currency.
 *
 * A per-week figure that cannot be written in the plan's currency is left
 * off the card rather than shown in pounds: the cards used to print
 * "≈ £0.67/wk" under whatever price the App Store returned.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import PlanPicker from "../PlanPicker";
import { PRO_PLANS, localizePlans, type ProPlan } from "@/lib/proPlans";

afterEach(cleanup);

function renderPicker(plans: ProPlan[]) {
  render(<PlanPicker plans={plans} selectedPlan="yearly" onSelect={vi.fn()} />);
  return screen.getAllByRole("radio");
}

describe("PlanPicker — prices and per-week figures", () => {
  it("the pound plans: price, period and the per-week anchor", () => {
    const [monthly, yearly] = renderPicker(PRO_PLANS);
    expect(monthly.textContent).toContain("£3.99/month");
    expect(monthly.textContent).toContain("≈ £0.92/wk");
    expect(yearly.textContent).toContain("£34.99/year");
    expect(yearly.textContent).toContain("≈ £0.67/wk");
    expect(yearly.textContent).toContain("Save 27%");
  });

  it("a store's plans: the per-week figures in the store's currency", () => {
    const [monthly, yearly] = renderPicker(
      localizePlans({
        monthly: { priceString: "€4.49", price: 4.49, currencyCode: "EUR" },
        yearly: { priceString: "€39.99", price: 39.99, currencyCode: "EUR" },
      })
    );
    expect(yearly.textContent).toContain("€39.99/year");
    expect(yearly.textContent).toMatch(/\/wk/);
    expect(yearly.textContent).toContain("€");
    // €4.49 × 12 = €53.88 against €39.99.
    expect(yearly.textContent).toContain("Save 26%");
    expect(monthly.textContent).toMatch(/\/wk/);
    expect(`${monthly.textContent}${yearly.textContent}`).not.toContain("£");
  });

  it("leaves the per-week figure off a card it cannot write, and keeps the price", () => {
    const unwritable = PRO_PLANS.map((p) =>
      p.id === "yearly" ? { ...p, currencyCode: "" } : p
    );
    const [monthly, yearly] = renderPicker(unwritable);
    expect(yearly.textContent).toContain("£34.99/year");
    expect(yearly.textContent).not.toMatch(/\/wk/);
    // Anchor: the other card still has its figure, so the absence above is
    // this card's, not a picker that stopped drawing them.
    expect(monthly.textContent).toContain("≈ £0.92/wk");
  });
});
