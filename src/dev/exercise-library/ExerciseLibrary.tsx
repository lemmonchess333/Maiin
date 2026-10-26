import { useState, useEffect } from "react";

import "@/index.css";
import "./library.css";
import ExerciseFormContent from "@/components/ExerciseFormContent";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { EXERCISES } from "@/lib/exercises";
import { FORM_ARTWORK } from "@/lib/formArtwork";
import { readJson, writeJson } from "@/lib/localStore";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import ExerciseCard from "./ExerciseCard";

const exercises = EXERCISES.filter(
  (e) => FORM_ARTWORK[e.id]?.status === "approved"
).sort((a, b) => a.name.localeCompare(b.name));
const flagStorageKey = "tropos.exercise-library.flags.v1";

function loadFlags(): Set<string> {
  const saved = readJson<unknown>(flagStorageKey, []);
  return new Set(
    Array.isArray(saved)
      ? saved.filter(
          (id): id is string =>
            typeof id === "string" && exercises.some((e) => e.id === id)
        )
      : []
  );
}

export default function Library() {
  const [query, setQuery] = useState("");
  const [id, setId] = useState<string | null>(null);
  const [dark, setDark] = useState(true);
  const reducedMotion = useReducedMotion();
  const [playOverride, setPlayOverride] = useState<boolean | null>(null);
  const playing = playOverride ?? !reducedMotion;
  const [soloPlayback, setSoloPlayback] = useState<Set<string>>(
    () => new Set()
  );
  const anyPlaying = playing || soloPlayback.size > 0;
  const [slow, setSlow] = useState(false);
  const [large, setLarge] = useState(false);
  const [restart, setRestart] = useState(0);
  const [pageVisible, setPageVisible] = useState(!document.hidden);
  const [flags, setFlags] = useState(loadFlags);
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const searchTerms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const visible = exercises.filter((e) => {
    const text = `${e.name} ${e.muscleGroup} ${e.equipment}`.toLowerCase();
    return (
      (!flaggedOnly || flags.has(e.id)) &&
      searchTerms.every((term) => text.includes(term))
    );
  });
  const current = exercises.find((e) => e.id === id);
  const index = current ? visible.indexOf(current) : -1;
  const toggleFlag = (exerciseId: string) => {
    const next = new Set(flags);
    if (next.has(exerciseId)) next.delete(exerciseId);
    else next.add(exerciseId);
    setFlags(next);
    setSaveFailed(!writeJson(flagStorageKey, [...next]));
  };
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);
  useEffect(() => {
    const update = () => setPageVisible(!document.hidden);
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  return (
    <main className="min-h-screen bg-background text-foreground p-4">
      <div className="library-container space-y-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-h2 font-bold">Exercise library</h1>
            <p className="text-small text-muted-foreground">
              <span className="font-mono tabular-nums">{exercises.length}</span>{" "}
              finished exercises · Click a card for the full viewer
            </p>
          </div>
          <Button variant="outline" onClick={() => setDark(!dark)}>
            {dark ? "Light theme" : "Dark theme"}
          </Button>
        </header>
        <div className="library-search">
          <label className="block text-small">
            Search exercises
            <input
              className="ds-input mt-1 w-full"
              type="search"
              placeholder="Name, muscle or equipment"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          {query && (
            <Button variant="outline" onClick={() => setQuery("")}>
              Clear search
            </Button>
          )}
          <Button
            variant="outline"
            aria-pressed={flaggedOnly}
            onClick={() => setFlaggedOnly((value) => !value)}
          >
            Flagged only{" "}
            <span className="font-mono tabular-nums">({flags.size})</span>
          </Button>
        </div>
        <nav aria-label="Grid playback" className="library-playback">
          <Button
            variant="outline"
            aria-pressed={anyPlaying}
            onClick={() => {
              setPlayOverride(!anyPlaying);
              setSoloPlayback(new Set());
            }}
          >
            {anyPlaying ? "Pause grid" : "Play grid"}
          </Button>
          <Button
            variant="outline"
            aria-pressed={slow}
            onClick={() => setSlow((value) => !value)}
          >
            {slow ? "Normal speed" : "Slower playback"}
          </Button>
          <Button
            variant="outline"
            onClick={() => setRestart((value) => value + 1)}
          >
            Restart previews
          </Button>
          <Button
            variant="outline"
            aria-pressed={large}
            onClick={() => setLarge((value) => !value)}
          >
            {large ? "Compact previews" : "Larger previews"}
          </Button>
        </nav>
        <p role="status" className="text-small text-muted-foreground">
          <span className="font-mono tabular-nums">{visible.length}</span> of{" "}
          <span className="font-mono tabular-nums">{exercises.length}</span>{" "}
          exercises
          {flags.size > 0 && (
            <>
              {" "}
              · <span className="font-mono tabular-nums">
                {flags.size}
              </span>{" "}
              flagged
              {saveFailed ? " for this visit only" : " · saved in this browser"}
            </>
          )}
        </p>
        {saveFailed && (
          <p role="alert" className="text-small text-muted-foreground">
            Your review flags could not be saved. Keep this page open to retain
            them.
          </p>
        )}
        <section
          aria-label="Exercise grid"
          className={`library-grid${large ? " library-grid-large" : ""}`}
        >
          {visible.map((exercise) => (
            <ExerciseCard
              key={exercise.id}
              exercise={exercise}
              playing={
                (playing || soloPlayback.has(exercise.id)) &&
                !current &&
                pageVisible
              }
              delay={slow ? 2400 : 1200}
              restart={restart}
              onOpen={() => setId(exercise.id)}
              onReplay={() => {
                if (!playing)
                  setSoloPlayback((previous) =>
                    new Set(previous).add(exercise.id)
                  );
              }}
              onComplete={() =>
                setSoloPlayback((previous) => {
                  if (!previous.has(exercise.id)) return previous;
                  const next = new Set(previous);
                  next.delete(exercise.id);
                  return next;
                })
              }
              flagged={flags.has(exercise.id)}
              onToggleFlag={() => toggleFlag(exercise.id)}
            />
          ))}
        </section>
        {!visible.length && (
          <div className="space-y-3">
            <p className="text-muted-foreground">
              {flaggedOnly && flags.size === 0
                ? "No exercises flagged. Use “Flag for review” beneath any preview to save it here."
                : "No exercises match your filters."}
            </p>
            <Button
              variant="outline"
              onClick={() => {
                setQuery("");
                setFlaggedOnly(false);
              }}
            >
              Show all exercises
            </Button>
          </div>
        )}
      </div>
      <Dialog
        open={Boolean(current)}
        onClose={() => setId(null)}
        title={current?.name}
        size="lg"
        closeButton
        className="library-dialog"
      >
        {current && (
          <>
            <nav aria-label="Browse exercises" className="library-navigation">
              <Button
                variant="outline"
                disabled={index <= 0}
                onClick={() => setId(visible[index - 1].id)}
              >
                Previous
              </Button>
              <span className="text-small font-mono tabular-nums">
                {index + 1} / {visible.length}
              </span>
              <Button
                variant="outline"
                disabled={index < 0 || index >= visible.length - 1}
                onClick={() => setId(visible[index + 1].id)}
              >
                Next
              </Button>
            </nav>
            <ExerciseFormContent key={current.id} exerciseName={current.name} />
            <Button
              variant="outline"
              className="library-back"
              onClick={() => setId(null)}
            >
              Back to grid
            </Button>
          </>
        )}
      </Dialog>
    </main>
  );
}
