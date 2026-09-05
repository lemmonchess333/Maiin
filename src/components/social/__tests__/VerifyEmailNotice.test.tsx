import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const { sendVerificationEmail, toastSuccess, toastError } = vi.hoisted(() => ({
  sendVerificationEmail: vi.fn(async () => {}),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/lib/accountSecurity", () => ({
  sendVerificationEmail,
  resendVerificationErrorMessage: () => "Couldn't send the email. Try again.",
}));
vi.mock("@/lib/toast", () => ({
  toast: { success: toastSuccess, error: toastError },
}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));

import VerifyEmailNotice from "../VerifyEmailNotice";

describe("VerifyEmailNotice", () => {
  beforeEach(() => {
    sendVerificationEmail.mockClear();
    toastSuccess.mockClear();
    toastError.mockClear();
  });

  it("names the held action and offers the two verbs", () => {
    render(<VerifyEmailNotice onRecheck={async () => false} />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Verify your email to post"
    );
    expect(screen.getByRole("button", { name: "Resend link" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "I have verified" })
    ).toBeVisible();
  });

  it("says 'comment' on the comment sheets", () => {
    render(
      <VerifyEmailNotice action="comment" onRecheck={async () => false} />
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Verify your email to comment"
    );
  });

  it("resend sends the verification email through the shared path", async () => {
    render(<VerifyEmailNotice onRecheck={async () => false} />);
    fireEvent.click(screen.getByRole("button", { name: "Resend link" }));
    await waitFor(() => expect(sendVerificationEmail).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
  });

  it("recheck reports the outcome of the parent's reload", async () => {
    const onRecheck = vi.fn(async () => false);
    render(<VerifyEmailNotice onRecheck={onRecheck} />);
    fireEvent.click(screen.getByRole("button", { name: "I have verified" }));
    await waitFor(() => expect(onRecheck).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});
