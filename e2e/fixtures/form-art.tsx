import { createRoot } from "react-dom/client";
import { useState } from "react";
import "../../src/index.css";
import ExerciseRigDemo from "../../src/components/ExerciseRigDemo";
import ExerciseFormFrames from "../../src/components/ExerciseFormFrames";
import { getAuthoredBeats, getFormBeats } from "../../src/lib/bodyRig";
import { FORM_ARTWORK } from "../../src/lib/formArtwork";
import { Button } from "../../src/components/ui/Button";
export default function Review() {
  const [id, setId] = useState("barbell-row");
  const [dark, setDark] = useState(true);
  const [step, setStep] = useState(0);
  const [request, setRequest] = useState<{ index: number; serial: number }>();
  const draftFiles = [
    "1-master.png",
    "2-early-candidate.png",
    "3-mid-candidate.png",
    "4-top-colour-candidate.png",
    "5-lower-candidate.png",
    "6-return-candidate.png",
  ];
  const draft = id === "db-curl (draft)";
  const beats = draft
    ? getAuthoredBeats("db-curl")!.map((beat, i) => ({
        ...beat,
        image: `docs/exercise-art/pilots/db-curl/${draftFiles[i]}`,
      }))
    : getFormBeats(id)!;
  return (
    <div className={dark ? "dark" : ""}>
      <main className="min-h-screen bg-background text-foreground p-4">
        <div className="mx-auto max-w-[390px] space-y-3">
          <h1 className="text-h2 font-bold">Form artwork review</h1>
          <label className="block">
            Exercise
            <select
              aria-label="Exercise"
              className="ds-input w-full"
              value={id}
              onChange={(event) => {
                setId(event.target.value);
                setRequest(undefined);
              }}
            >
              {[...Object.keys(FORM_ARTWORK), "db-curl (draft)"].map(
                (value) => (
                  <option key={value}>{value}</option>
                )
              )}
            </select>
          </label>
          <Button variant="outline" onClick={() => setDark((value) => !value)}>
            {dark ? "Light theme" : "Dark theme"}
          </Button>
          {draft ? (
            <>
              <p role="status" className="text-small text-muted-foreground">
                Draft: alignment diagnostics passed; technique, equipment and
                mobile playback review pending. Not released.
              </p>
              <ExerciseFormFrames
                key={`${id}-${request?.serial ?? 0}`}
                beats={beats}
                name="Dumbbell Curl"
                onStep={setStep}
                initialIndex={request?.index}
                autoPlay={!request}
              />
            </>
          ) : (
            <ExerciseRigDemo
              key={id}
              exerciseId={id}
              name={id}
              onStep={setStep}
              stepRequest={request}
            />
          )}
          {beats.map((beat, i) => (
            <Button
              key={i}
              variant="ghost"
              className="w-full justify-start text-left whitespace-normal h-auto min-h-11"
              aria-current={step === i ? "step" : undefined}
              onClick={() =>
                setRequest((previous) => ({
                  index: i,
                  serial: (previous?.serial ?? 0) + 1,
                }))
              }
            >
              <span className="font-mono tabular-nums mr-2">{i + 1}</span>
              {beat.cue}
            </Button>
          ))}
        </div>
      </main>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<Review />);
