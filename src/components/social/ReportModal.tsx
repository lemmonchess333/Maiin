/**
 * ReportModal — the report form (ReportForm, S4) in a centred dialog.
 *
 * For surfaces that are not themselves a sheet: the feed card, a Space
 * post, a profile. The comment sheets render ReportForm in place of their
 * list instead, because a dialog cannot sit over a sheet (the sheet takes
 * the first tap as a tap outside itself and closes).
 */
import { useId } from "react";
import { Dialog } from "@/components/ui/Dialog";
import ReportForm, { type ReportFormProps } from "./ReportForm";

type Props = Omit<ReportFormProps, "headingId">;

export default function ReportModal(props: Props) {
  const headingId = useId();
  return (
    <Dialog
      open
      onClose={props.onClose}
      size="sm"
      closeButton
      labelledBy={headingId}
    >
      <ReportForm {...props} headingId={headingId} />
    </Dialog>
  );
}
