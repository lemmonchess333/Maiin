import { useMemo } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { formatShortWeekdayDayMonth } from "@/utils/formatters";
import { parseLocalDate } from "@/lib/dateHelpers";
import DayActionContent, {
  type DayActionContentProps,
} from "./DayActionContent";

interface DayActionSheetProps extends Omit<
  DayActionContentProps,
  "dateKey" | "showClose"
> {
  open: boolean;
  /** Local "YYYY-MM-DD" of the day being managed. Required only
   *  when `open`. Pass null when closed; the sheet renders nothing. */
  dateKey: string | null;
}

/**
 * Home's day sheet (DayPeekCard's "Manage day"): one day's training to
 * manage (`DayActionContent`) in a bottom sheet, closed once an action
 * lands. Train's run card opens the same content as the run's own page.
 */
export default function DayActionSheet({
  open,
  onClose,
  dateKey,
  ...content
}: DayActionSheetProps) {
  const dayLabel = useMemo(
    () => (dateKey ? formatShortWeekdayDayMonth(parseLocalDate(dateKey)) : ""),
    [dateKey]
  );
  if (!open || !dateKey) return null;
  return (
    <BottomSheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={`Manage ${dayLabel}`}
      hideHeader
    >
      <div className="px-5 pb-6 pt-3 space-y-4">
        {/* Drag handle */}
        <div className="w-9 h-1 rounded-full sheet-handle mx-auto" />
        <DayActionContent
          {...content}
          dateKey={dateKey}
          onClose={onClose}
          showClose
        />
      </div>
    </BottomSheet>
  );
}
