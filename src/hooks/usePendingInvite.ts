import { useState, useSyncExternalStore } from "react";
import {
  pendingInviteRevision,
  readPendingInvite,
  subscribePendingInvite,
} from "@/lib/pendingInvite";
import { formatInviteCode } from "@/lib/inviteCode";

/** Updates even when a native link arrives after a screen has mounted. */
function usePendingInviteRevision(): number {
  return useSyncExternalStore(
    subscribePendingInvite,
    pendingInviteRevision,
    () => 0
  );
}

export function usePendingInvite(): string | null {
  usePendingInviteRevision();
  return readPendingInvite();
}

/** A newly opened link fills the field; ordinary typing stays local.
 *  `initial` is the field as it was before setup was drawn again under a
 *  new account (A6's Save your plan), over the link's code. */
export function useInviteCodeInput(initial?: string) {
  const revision = usePendingInviteRevision();
  const pending = readPendingInvite();
  const [seen, setSeen] = useState(revision);
  const [value, setValue] = useState(
    () => initial ?? (pending ? formatInviteCode(pending) : "")
  );
  if (revision !== seen) {
    setSeen(revision);
    if (pending) setValue(formatInviteCode(pending));
  }
  return [value, setValue, revision] as const;
}
