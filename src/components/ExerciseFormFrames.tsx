import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import type { FormBeat } from "@/lib/bodyRig";

interface Props {
  beats: readonly FormBeat[];
  name: string;
  active?: boolean;
  initialIndex?: number;
  autoPlay?: boolean;
  onStep?: (index: number) => void;
}

const frameUrl = (path: string) =>
  `${(import.meta.env.BASE_URL || "/").replace(/\/$/, "")}/${path.replace(/^\//, "")}`;

/** Authored stills, in order. Never interpolate anatomy or fall back to a rig. */
export default function ExerciseFormFrames({
  beats,
  name,
  active = true,
  initialIndex = 0,
  autoPlay = true,
  onStep,
}: Props) {
  const reducedMotion = useReducedMotion();
  const [index, setIndex] = useState(Math.max(0, Math.min(5, initialIndex)));
  const [playing, setPlaying] = useState(autoPlay);
  const [slow, setSlow] = useState(false);
  const [loaded, setLoaded] = useState<Record<number, boolean>>({});
  const [failed, setFailed] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [visible, setVisible] = useState(() => !document.hidden);
  const callback = useRef(onStep);
  useEffect(() => {
    callback.current = onStep;
  }, [onStep]);
  useEffect(() => {
    callback.current?.(index);
  }, [index]);
  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  const complete =
    beats.length === 6 && beats.every((beat) => Boolean(beat.image));
  const next = (index + 1) % 6;
  const running =
    complete &&
    playing &&
    active &&
    visible &&
    !reducedMotion &&
    failed === null;
  useEffect(() => {
    if (!running || !loaded[index] || !loaded[next]) return;
    const timer = window.setTimeout(() => setIndex(next), slow ? 2400 : 1200);
    return () => window.clearTimeout(timer);
  }, [running, loaded, index, next, slow]);

  if (!complete)
    return (
      <p role="status" className="mt-4 text-muted-foreground">
        This form guide is not ready yet.
      </p>
    );

  const select = (value: number) => {
    setPlaying(false);
    setFailed(null);
    setIndex((value + 6) % 6);
  };
  const fail = (value: number) => {
    setFailed(value);
    setPlaying(false);
  };
  // Two mounted images at most; preloading is limited to the adjacent frame.
  const mounted = running ? [index, next] : [index];
  return (
    <section
      className="mt-4"
      aria-label={`${name} form guide`}
      data-demo-still={reducedMotion ? "placard" : undefined}
    >
      <div className="bg-stage rounded-2xl p-3">
        <div className="relative mx-auto h-[360px] max-w-[360px]">
          {mounted.map((i) => (
            <img
              key={`${beats[i].image}-${attempt}`}
              src={frameUrl(beats[i].image!)}
              alt={i === index ? `${name}, ${beats[i].label}` : ""}
              aria-hidden={i !== index}
              draggable={false}
              decoding="async"
              className="absolute inset-0 size-full object-contain"
              style={{
                visibility:
                  i === index && failed !== index ? "visible" : "hidden",
              }}
              onLoad={() =>
                setLoaded((previous) =>
                  previous[i] ? previous : { ...previous, [i]: true }
                )
              }
              onError={() => fail(i)}
            />
          ))}
          {!loaded[index] && failed === null && (
            <p
              role="status"
              className="absolute inset-x-0 bottom-0 text-center text-small text-stage-muted"
            >
              Loading frame…
            </p>
          )}
          {failed === index && (
            <p
              role="status"
              className="absolute inset-0 flex items-center justify-center text-small text-stage-muted"
            >
              Frame could not load.
            </p>
          )}
        </div>
        <p
          aria-live={running ? "off" : "polite"}
          className="mt-2 text-center text-micro uppercase tracking-wider text-stage-muted"
        >
          {beats[index].label}{" "}
          <span className="font-mono tabular-nums">{index + 1}/6</span>
        </p>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        <IconButton
          aria-label="Previous frame"
          icon={<ChevronLeft />}
          onClick={() => select(index - 1)}
        />
        {!reducedMotion && (
          <Button
            variant="secondary"
            disabled={failed !== null}
            leftIcon={
              playing ? (
                <Pause className="size-4" />
              ) : (
                <Play className="size-4" />
              )
            }
            onClick={() => setPlaying((value) => !value)}
          >
            {playing ? "Pause" : "Play"}
          </Button>
        )}
        <IconButton
          aria-label="Next frame"
          icon={<ChevronRight />}
          onClick={() => select(next)}
        />
        {!reducedMotion && (
          <Button
            variant="ghost"
            aria-label="Slower playback"
            aria-pressed={slow}
            onClick={() => setSlow((value) => !value)}
          >
            {slow ? "Slower" : "Normal"}
          </Button>
        )}
      </div>
      {failed !== null && (
        <div className="mt-2 text-center">
          <p role="status" className="text-small text-muted-foreground">
            {failed !== index
              ? "The next frame could not load. Playback is paused."
              : "You can still read the instructions below."}
          </p>
          <Button
            variant="outline"
            className="mt-2"
            onClick={() => {
              setLoaded({});
              setFailed(null);
              setAttempt((value) => value + 1);
              setPlaying(!reducedMotion);
            }}
          >
            Retry images
          </Button>
        </div>
      )}
    </section>
  );
}
