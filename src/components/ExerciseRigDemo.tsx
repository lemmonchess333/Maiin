import { Suspense } from "react";
import { lazyRetry } from "@/lib/lazyRetry";
import { getFormBeats, getFormPlayback } from "@/lib/formGuides";
import { getFormArtFraming } from "@/lib/formArtFraming";
import { FORM_ART_COMPOSITES } from "@/lib/formArtComposites";
import ExerciseFormFrames from "@/components/ExerciseFormFrames";
import { Spinner } from "@/components/ui/Spinner";

const LegacyExerciseRigDemo = lazyRetry(
  () => import("./LegacyExerciseRigDemo")
);

interface ExerciseRigDemoProps {
  exerciseId: string;
  name: string;
  active?: boolean;
  compact?: boolean;
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
        framing={getFormArtFraming(props.exerciseId)}
        composite={FORM_ART_COMPOSITES[props.exerciseId]}
        active={props.active}
        compact={props.compact}
        onStep={props.onStep}
        initialIndex={props.stepRequest?.index}
        autoPlay={!props.stepRequest}
        loop={getFormPlayback(props.exerciseId) === "cycle"}
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
