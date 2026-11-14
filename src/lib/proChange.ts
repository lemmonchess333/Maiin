/**
 * What Pro changed for a person, as the account stores it (`proChanges` on
 * the profile, App1 Q56). Kept apart from proReport.ts so auth.tsx can name
 * the profile field's type without importing the module that reads the
 * profile, which made an import cycle.
 */
export type ProChangeKind = "calories" | "paces";

export interface ProChange {
  kind: ProChangeKind;
  /** When the change was made, an ISO instant. */
  at: string;
  /** Calories in kcal, paces as VDOT. Null for a runner's first paces. */
  from: number | null;
  to: number;
}
