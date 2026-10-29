import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { cn } from "@/lib/utils";
import type { FormBeat } from "@/lib/formGuides";
import type { FormArtFraming } from "@/lib/formArtFraming";
import type { FormArtComposite } from "@/lib/formArtComposites";

interface Props {
  beats: readonly FormBeat[];
  name: string;
  framing?: FormArtFraming;
  composite?: FormArtComposite;
  active?: boolean;
  compact?: boolean;
  initialIndex?: number;
  autoPlay?: boolean;
  loop?: boolean;
  onStep?: (index: number) => void;
}

const frameUrl = (path: string) =>
  `${(import.meta.env.BASE_URL || "/").replace(/\/$/, "")}/${path.replace(/^\//, "")}`;

/** Authored stills, in order. Never interpolate anatomy or fall back to a rig. */
export default function ExerciseFormFrames({
  beats,
  name,
  framing,
  composite,
  active = true,
  compact = false,
  initialIndex = 0,
  autoPlay = true,
  loop = true,
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
  const ready = (frame: number) =>
    Boolean(loaded[frame]) &&
    (composite?.layers
      .filter((layer) => layer.targetIndex === frame)
      .every((layer) => Boolean(loaded[layer.sourceIndex])) ??
      true);
  const currentReady = ready(index);
  const nextReady = ready(next);
  const sequenceEnd = !loop && index === 5;
  const running =
    complete &&
    playing &&
    active &&
    visible &&
    !reducedMotion &&
    !sequenceEnd &&
    failed === null;
  useEffect(() => {
    if (!running || !currentReady || !nextReady) return;
    const timer = window.setTimeout(() => setIndex(next), slow ? 2400 : 1200);
    return () => window.clearTimeout(timer);
  }, [running, currentReady, nextReady, index, next, slow]);

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
        <div
          className={cn(
            "relative mx-auto aspect-square w-full max-w-[360px] overflow-hidden",
            compact && "max-w-[min(260px,34dvh)]"
          )}
        >
          {mounted.map((i) => {
            const overlays =
              composite?.layers.filter((layer) => layer.targetIndex === i) ??
              [];
            const visible =
              i === index &&
              failed !== index &&
              (overlays.length === 0 || ready(i));
            const transform = framing
              ? `translate(${framing.x * 100}%, ${framing.y * 100}%) scale(${framing.scale})`
              : undefined;
            return (
              <div
                key={`${beats[i].image}-${attempt}`}
                className="absolute inset-0 mix-blend-lighten"
                style={{
                  visibility: visible ? "visible" : "hidden",
                  transform,
                }}
              >
                <div
                  className="relative mx-auto h-full"
                  // Crop coordinates belong to the 700×920 artwork, not
                  // the square stage's letterbox margins. All layers share
                  // this one centered canvas and camera transform.
                  style={{
                    width: composite
                      ? `${(composite.width / composite.height) * 100}%`
                      : "100%",
                  }}
                >
                  <img
                    src={frameUrl(beats[i].image!)}
                    alt={i === index ? `${name}, ${beats[i].label}` : ""}
                    aria-hidden={i !== index}
                    draggable={false}
                    decoding="async"
                    // The frames are drawn on black. Lighten merges that black
                    // into the stage so no darker box sits behind the figure.
                    className="absolute inset-0 size-full object-contain"
                    onLoad={() =>
                      setLoaded((previous) =>
                        previous[i] ? previous : { ...previous, [i]: true }
                      )
                    }
                    onError={() => fail(i)}
                  />
                  {overlays.map((layer) => (
                    <img
                      key={`${layer.sourceIndex}-${layer.left}-${layer.top}`}
                      src={frameUrl(beats[layer.sourceIndex].image!)}
                      alt=""
                      aria-hidden="true"
                      draggable={false}
                      decoding="async"
                      className="absolute inset-0 size-full object-contain"
                      style={{
                        clipPath: composite
                          ? `inset(${(layer.top / composite.height) * 100}% ${((composite.width - layer.left - layer.width) / composite.width) * 100}% ${((composite.height - layer.top - layer.height) / composite.height) * 100}% ${(layer.left / composite.width) * 100}%)`
                          : undefined,
                      }}
                      onLoad={() =>
                        setLoaded((previous) =>
                          previous[layer.sourceIndex]
                            ? previous
                            : { ...previous, [layer.sourceIndex]: true }
                        )
                      }
                      onError={() => fail(i)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
          {!ready(index) && failed === null && (
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
          className={cn(
            "mt-2 text-center text-stage-muted",
            compact ? "text-small" : "text-micro"
          )}
        >
          {beats[index].label}{" "}
          <span className="font-mono tabular-nums">{index + 1}/6</span>
        </p>
        {compact && (
          <p
            aria-live={running ? "off" : "polite"}
            className="mt-1 min-h-10 text-center text-small leading-relaxed text-stage-foreground"
          >
            {beats[index].cue}
          </p>
        )}
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
              playing && !sequenceEnd ? (
                <Pause className="size-4" />
              ) : (
                <Play className="size-4" />
              )
            }
            onClick={() => {
              if (sequenceEnd) {
                setIndex(0);
                setPlaying(true);
              } else {
                setPlaying((value) => !value);
              }
            }}
          >
            {sequenceEnd ? "Replay" : playing ? "Pause" : "Play"}
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
