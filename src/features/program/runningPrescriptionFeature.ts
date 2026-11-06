/** INACTIVE. No runtime flag enables this build. Authenticated transport is installed but the server release switch also defaults off.
 * Enabling this alone hides legacy prescriptions; it does NOT enroll anyone
 * or make authoritative sessions launchable. */
export const RUNNING_PRESCRIPTION_GATE_ENABLED = false;

/** Separate, source-only launch release gate. No runtime opt-in. */
export const CANONICAL_RUNNING_LAUNCH_ENABLED = false;
