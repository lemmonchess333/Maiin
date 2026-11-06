import { httpsCallable } from "firebase/functions";
import { auth, functions } from "@/lib/firebase";
import type { OutsideTrainingReceipt, OutsideTrainingSubmission } from "@/components/program/OutsideTrainingReportForm";

/** Only a consented submission reaches this authenticated boundary. Stable
 * command IDs belong to the mounted draft; an uncertain send is never retried here. */
export async function submitOutsideTrainingReport(
  submission: OutsideTrainingSubmission,
  commandId: string
): Promise<OutsideTrainingReceipt> {
  const user = auth.currentUser;
  if (!user || user.uid !== submission.expectedUid || !navigator.onLine)
    throw Error("Check your account and connection before saving this report.");
  const response = await httpsCallable<OutsideTrainingSubmission & { commandId: string }, {
    outcome: "saved" | "replayed";
    receipt: OutsideTrainingReceipt;
  }>(functions, "submitOutsideTrainingReport")({ ...submission, commandId });
  if (auth.currentUser !== user || auth.currentUser?.uid !== submission.expectedUid || !navigator.onLine)
    throw Error("Your account or connection changed. Your save could not be confirmed.");
  if (!response.data || !["saved", "replayed"].includes(response.data.outcome) || !response.data.receipt)
    throw Error("Your report could not be confirmed. Keep your answers and try again.");
  // The form validates the full receipt against the exact submitted facts.
  return response.data.receipt;
}
