import { useProgram } from "@/features/program/useProgram";
import { useClaimMapForProgram } from "./useClaimMapForProgram";
export type { SavedRunDoc } from "./useClaimMapForProgram";

export function useClaimMap(dateAnchor?: string) {
  const { programState } = useProgram();
  return useClaimMapForProgram(programState, dateAnchor);
}
