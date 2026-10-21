import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import NewAccountMethodNote from "../NewAccountMethodNote";

afterEach(cleanup);

describe("NewAccountMethodNote (Polish2 call 3)", () => {
  it("names the way the account was made, and its address", () => {
    render(
      <NewAccountMethodNote
        method="google"
        email="sam@gmail.com"
        onSignInAnotherWay={() => {}}
      />
    );
    expect(
      screen.getByText(/Setting up a new account with Google/)
    ).toHaveTextContent(
      "Setting up a new account with Google (sam@gmail.com)."
    );
  });

  it("leaves a relay address out", () => {
    render(
      <NewAccountMethodNote
        method="apple"
        email="k7x9qzp2m@privaterelay.appleid.com"
        onSignInAnotherWay={() => {}}
      />
    );
    expect(
      screen.getByText(/Setting up a new account with Apple/)
    ).toHaveTextContent(/^Setting up a new account with Apple\.$/);
  });

  it("offers a way back to sign in another way", () => {
    const onSignInAnotherWay = vi.fn();
    render(
      <NewAccountMethodNote
        method="password"
        email="sam@example.com"
        onSignInAnotherWay={onSignInAnotherWay}
      />
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Used Tropos before? Sign in another way",
      })
    );
    expect(onSignInAnotherWay).toHaveBeenCalledTimes(1);
  });

  it("says nothing for a method it cannot name", () => {
    const { container } = render(
      <NewAccountMethodNote
        method={null}
        email="sam@example.com"
        onSignInAnotherWay={() => {}}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
