import { Suspense } from "react";
import { lazyRetry } from "@/lib/lazyRetry";
import { getFormBeats } from "@/lib/formGuides";
import ExerciseFormFrames from "@/components/ExerciseFormFrames";
import { Spinner } from "@/components/ui/Spinner";

const LegacyExerciseRigDemo = lazyRetry(
  () => import("./LegacyExerciseRigDemo")
);

interface ExerciseRigDemoProps {
  exerciseId: string;
  name: string;
  active?: boolean;
  tempo?: string;
  onStep?: (index: number) => void;
  stepRequest?: { index: number; serial: number };
}

/** A supplied sequence owns its playback, including loading and errors. */
export default function ExerciseRigDemo(props: ExerciseRigDemoProps) {
  const beats = getFormBeats(props.exerciseId);
  if (beats?.every((beat) => beat.image)) {
    return (
      <ExerciseFormFrames
        key={`${props.exerciseId}-${props.stepRequest?.serial ?? 0}`}
        beats={beats}
        name={props.name}
        active={props.active}
        onStep={props.onStep}
        initialIndex={props.stepRequest?.index}
        autoPlay={!props.stepRequest}
      />
    );
  }
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-12">
          <Spinner label="Loading exercise demo" />
        </div>
      }
    >
      <LegacyExerciseRigDemo key={props.exerciseId} {...props} />
    </Suspense>
  );
}
