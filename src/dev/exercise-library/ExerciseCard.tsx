import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import type { EXERCISES } from "@/lib/exercises";
import { FORM_ARTWORK } from "@/lib/formArtwork";
import { getFormArtCutout, formArtCutoutUrl } from "@/lib/formArtCutouts";
import { getFormBeats, getFormPlayback } from "@/lib/formGuides";

type Exercise = (typeof EXERCISES)[number];
const frameUrl = (path: string) =>
  `${import.meta.env.BASE_URL.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;

export function GridPreview({
  exercise,
  playing,
  delay,
  onFailure,
  onComplete,
}: {
  exercise: Exercise;
  playing: boolean;
  delay: number;
  onFailure: () => void;
  onComplete: () => void;
}) {
  const stage = useRef<HTMLSpanElement>(null);
  const [nearScreen, setNearScreen] = useState(false);
  const [frame, setFrame] = useState(0);
  const [loaded, setLoaded] = useState<Record<number, boolean>>({});
  const [failed, setFailed] = useState<number | null>(null);
  const beats = getFormBeats(exercise.id)!;
  const cutout = getFormArtCutout(exercise.id);
  const end =
    getFormPlayback(exercise.id) === "sequence" && frame === beats.length - 1;
  const next = (frame + 1) % beats.length;
  const running = playing && nearScreen && !end && failed === null;

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        setNearScreen(entry.isIntersecting);
        if (!entry.isIntersecting) setLoaded({});
      },
      { rootMargin: "80px" }
    );
    if (stage.current) observer.observe(stage.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!running || !loaded[frame] || !loaded[next]) return;
    const timer = window.setTimeout(() => {
      setFrame(next);
      if (
        getFormPlayback(exercise.id) === "sequence" &&
        next === beats.length - 1
      )
        onComplete();
    }, delay);
    return () => window.clearTimeout(timer);
  }, [
    running,
    loaded,
    frame,
    next,
    delay,
    exercise.id,
    beats.length,
    onComplete,
  ]);

  return (
    <>
      <span
        ref={stage}
        className={`library-preview${nearScreen ? " library-preview-moving" : ""}`}
        data-preview={exercise.id}
        data-frame={frame + 1}
        data-running={running}
      >
        {nearScreen
          ? (running ? [frame, next] : [frame]).map((i) => (
              <img
                key={beats[i].image}
                src={frameUrl(beats[i].image!)}
                alt={i === frame ? `${exercise.name}, ${beats[i].label}` : ""}
                aria-hidden={i !== frame}
                width={FORM_ARTWORK[exercise.id].width}
                height={FORM_ARTWORK[exercise.id].height}
                decoding="async"
                draggable={false}
                style={{
                  visibility:
                    i === frame && failed !== frame ? "visible" : "hidden",
                }}
                onLoad={() =>
                  setLoaded((previous) =>
                    previous[i] ? previous : { ...previous, [i]: true }
                  )
                }
                onError={() => {
                  setFailed(i);
                  onFailure();
                }}
              />
            ))
          : cutout && (
              <img
                src={formArtCutoutUrl(cutout)}
                alt=""
                width={cutout.width}
                height={cutout.height}
                loading="lazy"
                decoding="async"
                className="exercise-drawing"
              />
            )}
        {nearScreen && (!loaded[frame] || failed !== null) && (
          <span className="library-preview-message">
            {failed !== null ? "Frame unavailable · retry below" : "Loading…"}
          </span>
        )}
      </span>
      <span className="library-preview-caption text-small text-muted-foreground">
        <span className="font-mono tabular-nums">
          {frame + 1}/{beats.length}
        </span>{" "}
        · {end ? "Finished · replay below" : beats[frame].label}
      </span>
    </>
  );
}

export default function ExerciseCard({
  exercise,
  playing,
  delay,
  restart,
  onOpen,
  onReplay,
  onComplete,
  flagged,
  onToggleFlag,
}: {
  exercise: Exercise;
  playing: boolean;
  delay: number;
  restart: number;
  onOpen: () => void;
  onReplay: () => void;
  onComplete: () => void;
  flagged: boolean;
  onToggleFlag: () => void;
}) {
  const [replay, setReplay] = useState(0);
  const [failedAttempt, setFailedAttempt] = useState<string | null>(null);
  const attempt = `${restart}-${replay}`;
  const sequence = getFormPlayback(exercise.id) === "sequence";
  const resetPreview = () => {
    setFailedAttempt(null);
    setReplay((value) => value + 1);
  };

  return (
    <article className="library-grid-item" data-flagged={flagged}>
      <Button
        variant="outline"
        className="library-card"
        aria-label={`Watch ${exercise.name}`}
        onClick={onOpen}
      >
        <GridPreview
          key={attempt}
          exercise={exercise}
          playing={playing}
          delay={delay}
          onFailure={() => setFailedAttempt(attempt)}
          onComplete={onComplete}
        />
        <span className="library-card-name">{exercise.name}</span>
        <span className="text-small text-muted-foreground library-card-meta">
          {exercise.muscleGroup} · {exercise.equipment}
        </span>
      </Button>
      {failedAttempt === attempt && (
        <Button
          variant="outline"
          className="library-retry"
          aria-label={`Retry ${exercise.name} preview`}
          onClick={resetPreview}
        >
          Retry preview
        </Button>
      )}
      {sequence && (
        <Button
          variant="outline"
          className="library-replay"
          aria-label={`Replay ${exercise.name} preview`}
          onClick={() => {
            resetPreview();
            onReplay();
          }}
        >
          Replay preview
        </Button>
      )}
      <Button
        variant={flagged ? "secondary" : "outline"}
        className="library-flag"
        aria-pressed={flagged}
        aria-label={`${flagged ? "Flagged for review" : "Flag for review"}: ${exercise.name}`}
        onClick={onToggleFlag}
      >
        {flagged ? "Flagged for review" : "Flag for review"}
      </Button>
    </article>
  );
}
