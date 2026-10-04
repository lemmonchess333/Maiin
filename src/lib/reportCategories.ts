/**
 * The reasons the report form offers (S4b: five categories, each with up to
 * four sub-reasons, one screen).
 *
 * The values are the server's REPORT_CATEGORIES
 * (functions/lib/reportTargets.js), and the report alert email names them
 * with these labels (CATEGORY_LABELS in functions/lib/reportAlert.js); both
 * pinned by reportTargets.cross.test.ts.
 */
import type { ReportCategory } from "@/lib/socialApi";

export interface ReportCategoryOption {
  value: ReportCategory;
  label: string;
  /** Concrete sub-reasons. Closed set per category — keeps the picker
   *  consistent. The server accepts any string so adding new ones is
   *  client-only. */
  subReasons: string[];
}

export const REPORT_CATEGORY_OPTIONS: ReportCategoryOption[] = [
  {
    value: "harassment",
    label: "Harassment or bullying",
    subReasons: [
      "Targeted insults or threats",
      "Repeated unwanted contact",
      "Encouraging self-harm",
      "Other harassment",
    ],
  },
  {
    value: "spam",
    label: "Spam or misleading",
    subReasons: [
      "Unsolicited promotion",
      "Fake or misleading claims",
      "Scam or phishing",
    ],
  },
  {
    value: "inappropriate",
    label: "Inappropriate content",
    subReasons: [
      "Sexual or explicit",
      "Hateful symbols or slurs",
      "Violent or graphic",
    ],
  },
  {
    value: "impersonation",
    label: "Impersonation",
    subReasons: ["Pretending to be someone else", "Brand or organisation"],
  },
  {
    value: "other",
    label: "Other",
    subReasons: [],
  },
];
