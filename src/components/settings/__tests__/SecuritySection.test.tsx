import { describe, beforeEach, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { User } from "firebase/auth";
const h = vi.hoisted(() => ({
  send: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@/lib/accountSecurity", () => ({
  sendVerificationEmail: h.send,
  resendVerificationErrorMessage: () => "Couldn't send the email. Try again.",
  changePassword: vi.fn(),
  requestEmailChange: vi.fn(),
}));
vi.mock("@/lib/toast", () => ({
  toast: { success: h.success, error: h.error },
}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));
import SecuritySection from "../SecuritySection";
function makeUser() {
  const user = {
    uid: "u1",
    email: "person@example.com",
    emailVerified: false,
    providerData: [{ providerId: "password" }],
    reload: vi.fn(async () => {
      user.emailVerified = true;
    }),
    getIdToken: vi.fn().mockResolvedValue("fresh-token"),
  };
  return user as unknown as User & typeof user;
}
beforeEach(() => vi.clearAllMocks());
describe("account verification", () => {
  it("explains when verification is required", () => {
    render(<SecuritySection inline user={makeUser()} />);
    expect(
      screen.getByText(/Verify your email to post or comment/)
    ).toHaveTextContent("keep logging workouts and meals");
    expect(
      screen.getByText(/Verify your email to post or comment/)
    ).toHaveTextContent("delete your account while unverified");
  });
  it("refreshes the security token before displaying Verified", async () => {
    const user = makeUser();
    render(<SecuritySection inline user={user} />);
    fireEvent.click(screen.getByRole("button", { name: "I've verified" }));
    await screen.findByText("Verified", { exact: true });
    expect(user.getIdToken).toHaveBeenCalledWith(true);
    expect(h.success).toHaveBeenCalledWith("Email verified");
  });
  it("keeps a retry action when the refreshed token cannot be obtained", async () => {
    const user = makeUser();
    user.getIdToken.mockRejectedValueOnce(new Error("offline"));
    render(<SecuritySection inline user={user} />);
    fireEvent.click(screen.getByRole("button", { name: "I've verified" }));
    await waitFor(() =>
      expect(h.error).toHaveBeenCalledWith(
        expect.stringContaining("Couldn't check verification")
      )
    );
    expect(
      screen.queryByText("Verified", { exact: true })
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "I've verified" })).toBeEnabled();
    expect(h.success).not.toHaveBeenCalled();
  });
});
