import { useLayoutEffect } from "react";
import { useProgram } from "./useProgram";

export type ProgramController = ReturnType<typeof useProgram>;

/** Mounted only for maintenance or an edit; preserves the tested command,
 * conflict, offline-outbox and returning-runner behavior of the full engine. */
export default function HomeProgramController({
  publish,
}: {
  publish: (value: ProgramController) => void;
}) {
  const value = useProgram();
  useLayoutEffect(() => {
    publish(value);
  });
  return null;
}
