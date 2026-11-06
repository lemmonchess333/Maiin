import type { Response } from "@playwright/test";

/** Match the command response before asserting the UI and stored programme. */
export function isProgramCommandResponse(
  response: Response,
  kind: string,
  expectedUid: string
): boolean {
  if (
    !response.url().endsWith("/applyProgramCommand") ||
    response.request().method() !== "POST"
  ) {
    return false;
  }
  const { data } = response.request().postDataJSON();
  // sendProgramCommand wraps the command with its original account owner.
  return data?.command?.kind === kind && data.expectedUid === expectedUid;
}
