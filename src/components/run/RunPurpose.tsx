import type { ReactNode } from "react";
import PurposeDisclosure from "@/components/ui/PurposeDisclosure";

/** Coaching context is available on demand, beside the prescription. */
export default function RunPurpose({ children }: { children?: ReactNode }) {
  return <PurposeDisclosure label="Why this run">{children}</PurposeDisclosure>;
}
