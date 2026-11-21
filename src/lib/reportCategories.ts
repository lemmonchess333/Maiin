/**
 * The reasons the report form offers (S4b: five categories on one screen,
 * each but Other with its sub-reasons).
 *
 * Child safety, Promotes eating disorders and Illegal content sit under
 * Inappropriate content, and Copyright under Impersonation beside Brand or
 * organisation: the kinds of harm the Online Safety Act names, which the
 * legal audit found the list lacked.
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
   *  consistent. The server records any one as it is written (160
   *  characters at most), so adding one is client-only;
   *  reportTargets.cross.test.ts holds every one to that. */
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
      "Child safety",
      "Hateful symbols or slurs",
      "Violent or graphic",
      "Promotes eating disorders",
      "Illegal content",
    ],
  },
  {
    value: "impersonation",
    label: "Impersonation",
    subReasons: [
      "Pretending to be someone else",
      "Brand or organisation",
      "Copyright",
    ],
  },
  {
    value: "other",
    label: "Other",
    subReasons: [],
  },
];
