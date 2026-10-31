import {
  useState,
  useMemo,
  useRef,
  useEffect,
  useCallback,
  Suspense,
} from "react";
import { createPortal } from "react-dom";
import EmptyState from "@/components/ui/EmptyState";
import { useNavigate } from "react-router-dom";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { lazyRetry } from "@/lib/lazyRetry";
import { Spinner } from "@/components/ui/Spinner";
import { EXERCISE_CATEGORIES, getExercisesByCategory } from "@/lib/exercises";
import type { Exercise } from "@/lib/exercises";
import { cn } from "@/lib/utils";
import { THEME } from "@/lib/theme";
import { Search, X, Plus, Check, ArrowLeftRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useMotionSafe } from "@/hooks/useMotionSafe";
import { haptic } from "@/lib/haptic";
import ExerciseThumb from "@/components/program/ExerciseThumb";
import { useWorkouts } from "@/hooks/useWorkouts";
import SectionLabel from "@/components/ui/SectionLabel";
import { Button } from "@/components/ui/Button";
import { toast } from "@/lib/toast";
import { useFocusTrap } from "@/hooks/useFocusTrap";

const ALL_CATEGORIES = ["All", ...EXERCISE_CATEGORIES] as const;
const ExerciseFormContent = lazyRetry(
  () => import("@/components/ExerciseFormContent")
);

function initialCategoryFor(exerciseId?: string): string {
  return (
    (exerciseId &&
      EXERCISE_CATEGORIES.find((category) =>
        getExercisesByCategory(category).some(
          (exercise) => exercise.id === exerciseId
        )
      )) ||
    "All"
  );
}

interface Props {
  open: boolean;
  /** Return false after reporting a failed add; the picker keeps the draft. */
  onSelect: (exercise: Exercise) => void | boolean | Promise<void | boolean>;
  onMultiSelect?: (
    exercises: Exercise[]
  ) => void | boolean | Promise<void | boolean>;
  onClose: () => void;
  headerTitle?: string;
  existingExerciseIds?: string[];
  onRemoveExercise?: (exerciseId: string) => void;
  /** One exercise, for a swap or a replace, named by its action ("Swap for
   *  today", "Replace"): a row's circle does the action at once, and so
   *  does the detail sheet's button. Without it the picker adds, as many
   *  as are ticked. */
  pickAction?: string;
  /** The exercise a Replace or a swap stands in for (Lift8 (4)): the picker
   *  opens on its muscle group, not all of them, and marks it "Current"
   *  rather than offering it as its own replacement. */
  currentExerciseId?: string;
}

export default function ExercisePicker({
  open,
  onSelect,
  onMultiSelect,
  onClose,
  headerTitle = "Select exercise",
  existingExerciseIds,
  onRemoveExercise,
  pickAction,
  currentExerciseId,
}: Props) {
  const [searchQuery, setSearchQuery] = useState("");
  const motionSafe = useMotionSafe();
  const [selectedCategory, setSelectedCategory] = useState<string>(() =>
    initialCategoryFor(currentExerciseId)
  );
  // The plan owns exercises already in the workout. Keep only additions in
  // local state so reopening this mounted picker for another day cannot show
  // the previous day's checkmarks.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [removingIds, setRemovingIds] = useState<Set<string>>(() => new Set());
  const [saving, setSaving] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const savingRef = useRef(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [pendingProgressName, setPendingProgressName] = useState<string | null>(
    null
  );
  /* The row body opens the form guide; its trailing circle selects an
   * exercise. A new exercise's detail action commits it and any selections
   * already made in the list. */
  const [detail, setDetail] = useState<Exercise | null>(null);
  const navigate = useNavigate();
  const searchRef = useRef<HTMLInputElement>(null);
  const progressPromptRef = useRef<HTMLParagraphElement>(null);
  const progressActionRef = useRef<HTMLButtonElement>(null);
  const hadProgressPrompt = useRef(false);
  const pickerRef = useFocusTrap<HTMLDivElement>(open);
  const wasOpen = useRef(false);

  const preExistingIds = useMemo(
    () => new Set(existingExerciseIds ?? []),
    [existingExerciseIds]
  );

  useEffect(() => {
    if (open && !wasOpen.current) {
      setSelectedIds(new Set());
      setShowDiscardConfirm(false);
      setPendingProgressName(null);
      setDetail(null);
      setSearchQuery("");
      setSelectedCategory(initialCategoryFor(currentExerciseId));
    }
    wasOpen.current = open;
  }, [open, currentExerciseId]);

  useEffect(() => {
    if (open) searchRef.current?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (pendingProgressName) {
      progressPromptRef.current?.focus({ preventScroll: true });
    } else if (hadProgressPrompt.current && detail) {
      progressActionRef.current?.focus({ preventScroll: true });
    }
    hadProgressPrompt.current = pendingProgressName !== null;
  }, [pendingProgressName, detail]);

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();

  const filteredExercises = useMemo(() => {
    const getAll = () =>
      EXERCISE_CATEGORIES.flatMap((cat) => getExercisesByCategory(cat));
    const inCategory =
      selectedCategory === "All"
        ? getAll()
        : getExercisesByCategory(selectedCategory);
    if (!normalizedSearchQuery) return inCategory;
    return inCategory.filter((e) =>
      e.name.toLowerCase().includes(normalizedSearchQuery)
    );
  }, [normalizedSearchQuery, selectedCategory]);

  const allExercises = useMemo(() => {
    return EXERCISE_CATEGORIES.flatMap((cat) => getExercisesByCategory(cat));
  }, []);

  /* Recently used — the modern-picker feature (Hevy/Strong): the six
     most recent distinct exercises from logged workouts lead the list
     when browsing All. workouts arrive newest-first. */
  const { workouts } = useWorkouts();
  const recentExercises = useMemo(() => {
    const seen = new Set<string>();
    const out: Exercise[] = [];
    for (const w of workouts) {
      for (const ex of w.exercises) {
        if (seen.has(ex.exerciseId)) continue;
        seen.add(ex.exerciseId);
        const meta = allExercises.find((e) => e.id === ex.exerciseId);
        if (meta) out.push(meta);
        if (out.length >= 6) return out;
      }
    }
    return out;
  }, [workouts, allExercises]);

  const newlySelectedCount = useMemo(() => {
    return [...selectedIds].filter((id) => !preExistingIds.has(id)).length;
  }, [selectedIds, preExistingIds]);
  const batchCount =
    saving && selectedIds.size > 0 ? pendingCount : newlySelectedCount;

  const isSelected = (id: string) =>
    preExistingIds.has(id) || selectedIds.has(id);

  /* A swap or a replace picks one exercise, and the circle picks it: no
     bar to confirm it in. A swap can be undone from the exercise's menu
     ("Back to …"), and Finish asks before a swap reaches the plan, so a
     third check on the way in only cost a tap on every swap. */
  const commitPick = async (exercise: Exercise) => {
    if (exercise.id === currentExerciseId || savingRef.current) return;
    haptic("light");
    savingRef.current = true;
    setSaving(true);
    try {
      if ((await onSelect(exercise)) === false) return;
      setDetail(null);
      onClose();
    } catch {
      toast.error("Could not change exercise. Try again.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const removeExistingExercise = async (id: string) => {
    if (!onRemoveExercise || removingIds.has(id)) return;
    setRemovingIds((previous) => new Set(previous).add(id));
    try {
      await onRemoveExercise(id);
    } catch {
      toast.error("Could not remove exercise. Try again.");
    } finally {
      setRemovingIds((previous) => {
        const next = new Set(previous);
        next.delete(id);
        return next;
      });
    }
  };

  const toggleSelection = (id: string) => {
    if (id === currentExerciseId) return;
    haptic("light");
    if (preExistingIds.has(id)) {
      // Keep the checkmark until the plan reports a successful removal.
      void removeExistingExercise(id);
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    }
  };

  const handleAddSelected = async (includeId?: string) => {
    if (savingRef.current) return;
    const newlySelected = allExercises.filter(
      (e) =>
        (selectedIds.has(e.id) || e.id === includeId) &&
        !preExistingIds.has(e.id)
    );
    if (newlySelected.length === 0) {
      onClose();
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setPendingCount(newlySelected.length);
    setShowDiscardConfirm(false);
    try {
      if (onMultiSelect) {
        if ((await onMultiSelect(newlySelected)) === false) {
          return;
        }
      } else {
        for (const exercise of newlySelected) {
          if ((await onSelect(exercise)) === false) {
            return;
          }
        }
      }
      setSelectedIds(new Set());
      setDetail(null);
      onClose();
    } catch {
      toast.error("Could not add exercises. Try again.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const handleClose = useCallback(() => {
    // An in-flight add belongs to this opening. Keep it visible until the
    // result arrives so an older completion cannot close a new picker session.
    if (savingRef.current) return;
    setPendingProgressName(null);
    if (newlySelectedCount >= 2) {
      setShowDiscardConfirm(true);
    } else {
      setSelectedIds(new Set());
      onClose();
    }
  }, [newlySelectedCount, onClose]);

  // With the detail sheet open, Escape belongs to that sheet. While its
  // progress confirmation is shown, Escape cancels the confirmation and
  // keeps the sheet open. Capture before Vaul's own Escape handler.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (pendingProgressName) {
        e.preventDefault();
        e.stopPropagation();
        setPendingProgressName(null);
        return;
      }
      if (!detail) handleClose();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open, pendingProgressName, detail, handleClose]);

  const confirmDiscard = () => {
    if (savingRef.current) return;
    const progressName = pendingProgressName;
    setShowDiscardConfirm(false);
    setPendingProgressName(null);
    setSelectedIds(new Set());
    setDetail(null);
    onClose();
    if (progressName) {
      navigate(`/history/exercise/${encodeURIComponent(progressName)}`);
    }
  };

  const viewProgress = (name: string) => {
    if (newlySelectedCount > 0) {
      setPendingProgressName(name);
      return;
    }
    setDetail(null);
    onClose();
    navigate(`/history/exercise/${encodeURIComponent(name)}`);
  };

  const cancelSearch = () => {
    setSearchQuery("");
    searchRef.current?.blur();
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="picker-backdrop"
            initial={motionSafe({ opacity: 0 })}
            animate={{ opacity: 1 }}
            exit={motionSafe({ opacity: 0 })}
            transition={{ duration: 0.2 }}
            className="fixed inset-0"
            style={{ zIndex: 9998, backgroundColor: "rgba(0,0,0,0.4)" }}
            onClick={handleClose}
          />

          <motion.div
            key="picker-modal"
            ref={pickerRef}
            role="dialog"
            aria-modal="true"
            aria-label={headerTitle}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
            className="fixed inset-0 flex flex-col bg-background"
            style={{ zIndex: 9999 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 pt-3 pb-2 safe-area-pt">
              <button
                type="button"
                onClick={handleClose}
                aria-label="Close exercise picker"
                className="size-11 flex items-center justify-center rounded-full bg-muted"
              >
                <X className="size-5 text-muted-foreground" />
              </button>
              <p className="text-body font-semibold text-foreground">
                {headerTitle}
              </p>
              <div style={{ width: 32 }} />
            </div>

            {/* Discard confirmation */}
            <AnimatePresence>
              {showDiscardConfirm && (
                <motion.div
                  initial={motionSafe({ height: 0, opacity: 0 })}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={motionSafe({ height: 0, opacity: 0 })}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden px-4 pb-3"
                >
                  {/* The question keeps 8em beside its two answers, or
                      the answers go under it. */}
                  <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl bg-muted">
                    <p className="min-w-[min(100%,8em)] flex-1 text-sm text-foreground">
                      Discard {newlySelectedCount} selections?
                    </p>
                    <div className="ml-auto flex items-center gap-2">
                      <Button
                        variant="ghost"
                        disabled={saving}
                        onClick={() => {
                          setShowDiscardConfirm(false);
                        }}
                      >
                        Keep browsing
                      </Button>
                      <Button
                        variant="destructive-tinted"
                        disabled={saving}
                        onClick={confirmDiscard}
                      >
                        Discard
                      </Button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Search bar */}
            <div className="px-4 pb-2 flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  ref={searchRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    const nextQuery = e.target.value;
                    if (nextQuery.trim() && !normalizedSearchQuery) {
                      setSelectedCategory("All");
                    }
                    setSearchQuery(nextQuery);
                  }}
                  placeholder="Search exercises…"
                  aria-label="Search exercises"
                  className="w-full pl-9 pr-4 h-11 text-sm text-foreground placeholder:text-muted-foreground bg-muted rounded-xl border-none focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
              <AnimatePresence>
                {searchQuery && (
                  <motion.div
                    data-motion-driven
                    initial={motionSafe({ opacity: 0, width: 0 })}
                    animate={{ opacity: 1, width: "auto" }}
                    exit={motionSafe({ opacity: 0, width: 0 })}
                    transition={{ duration: 0.2 }}
                    className="shrink-0 overflow-hidden"
                  >
                    <Button variant="ghost" onClick={cancelSearch}>
                      Cancel
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Filter pills */}
            <div
              data-no-page-swipe
              className="flex overflow-x-auto gap-2 px-4 pb-2"
              style={{ scrollbarWidth: "none" }}
            >
              {ALL_CATEGORIES.map((cat) => (
                <button
                  type="button"
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  aria-pressed={selectedCategory === cat}
                  className={cn(
                    "h-11 px-4 rounded-full text-small whitespace-nowrap transition-colors shrink-0",
                    selectedCategory === cat
                      ? "font-semibold text-white bg-primary-strong"
                      : "font-medium bg-muted text-muted-foreground"
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Exercise list — card rows (lift-arc redesign): anatomy
                tile per category, tokenized lifting-tint selection,
                Recent section first when browsing All. */}
            <div className="flex-1 overflow-y-auto min-h-0 px-4 pb-28">
              {!normalizedSearchQuery &&
                selectedCategory === "All" &&
                recentExercises.length > 0 && (
                  <>
                    <SectionLabel className="pt-1 pb-2">Recent</SectionLabel>
                    <div className="space-y-1.5 mb-4">
                      {recentExercises.map((exercise) => (
                        <ExerciseRow
                          key={`recent-${exercise.id}`}
                          exercise={exercise}
                          isSelected={isSelected(exercise.id)}
                          isRemoving={
                            saving ||
                            removingIds.has(exercise.id) ||
                            (preExistingIds.has(exercise.id) &&
                              !onRemoveExercise)
                          }
                          isCurrent={exercise.id === currentExerciseId}
                          pickAction={pickAction}
                          onPick={commitPick}
                          onToggle={toggleSelection}
                          onOpen={setDetail}
                        />
                      ))}
                    </div>
                  </>
                )}

              <SectionLabel className="pt-1 pb-2">
                {normalizedSearchQuery
                  ? `Results · ${filteredExercises.length}`
                  : `${selectedCategory === "All" ? "All" : selectedCategory} · ${filteredExercises.length} exercises`}
              </SectionLabel>
              <div className="space-y-1.5">
                {filteredExercises.map((exercise) => (
                  <ExerciseRow
                    key={exercise.id}
                    exercise={exercise}
                    isSelected={isSelected(exercise.id)}
                    isRemoving={
                      saving ||
                      removingIds.has(exercise.id) ||
                      (preExistingIds.has(exercise.id) && !onRemoveExercise)
                    }
                    isCurrent={exercise.id === currentExerciseId}
                    pickAction={pickAction}
                    onPick={commitPick}
                    onToggle={toggleSelection}
                    onOpen={setDetail}
                  />
                ))}
              </div>
              {filteredExercises.length === 0 && (
                <EmptyState
                  compact
                  icon={Search}
                  headline="No exercises found"
                  sub="Try a different search term or browse by muscle group"
                />
              )}
            </div>

            {/* Batch selection bar: adding only. A swap or a replace is
                done by its row's circle. */}
            <AnimatePresence>
              {!pickAction && batchCount > 0 && (
                <motion.div
                  initial={{ y: "100%" }}
                  animate={{ y: 0 }}
                  exit={{ y: "100%" }}
                  transition={{ type: "spring", damping: 25, stiffness: 300 }}
                  className="p-4 safe-area-pb border-t border-border"
                >
                  <Button
                    variant="primary"
                    fullWidth
                    loading={saving}
                    onClick={() => void handleAddSelected()}
                  >
                    {batchCount} exercise
                    {batchCount !== 1 ? "s" : ""} selected — Add to workout
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Exercise detail shares the Form content with the history page.
              Adding here commits this exercise and any list selections;
              "View full progress" exits the picker. */}
          <BottomSheet
            open={detail !== null}
            onOpenChange={(o) => {
              if (o || savingRef.current) return;
              if (pendingProgressName) {
                setPendingProgressName(null);
              } else {
                setDetail(null);
              }
            }}
            title={detail?.name ?? null}
            maxHeight="max-h-[95dvh]"
            // Above the picker (9998/9999): at the sheet's own z-50 it
            // opened behind it, invisible, with the page made inert.
            overlayClassName="z-[10000]"
            className="z-[10001]"
          >
            {detail && (
              <>
                {/* The form scrolls; the actions under it stay in reach. */}
                <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-3">
                  <Suspense
                    fallback={
                      <div className="flex justify-center py-12">
                        <Spinner label="Loading exercise demo" />
                      </div>
                    }
                  >
                    <ExerciseFormContent
                      exerciseName={detail.name}
                      active
                      compactGuide
                    />
                  </Suspense>
                </div>
                <div className="border-t border-border/30 px-4 pt-3 pb-4">
                  {pendingProgressName ? (
                    <div className="rounded-xl bg-muted p-3">
                      <p
                        ref={progressPromptRef}
                        tabIndex={-1}
                        aria-live="polite"
                        className="text-small text-foreground"
                      >
                        Discard {newlySelectedCount} selection
                        {newlySelectedCount === 1 ? "" : "s"} and view{" "}
                        {pendingProgressName} progress?
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setPendingProgressName(null);
                          }}
                        >
                          Keep browsing
                        </Button>
                        <Button
                          variant="destructive-tinted"
                          onClick={confirmDiscard}
                        >
                          Discard and view
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <Button
                        variant={
                          !pickAction && preExistingIds.has(detail.id)
                            ? "secondary"
                            : "primary"
                        }
                        fullWidth
                        loading={saving}
                        disabled={
                          detail.id === currentExerciseId ||
                          saving ||
                          removingIds.has(detail.id) ||
                          (preExistingIds.has(detail.id) && !onRemoveExercise)
                        }
                        onClick={() => {
                          if (!pickAction) {
                            if (preExistingIds.has(detail.id)) {
                              toggleSelection(detail.id);
                            } else {
                              void handleAddSelected(detail.id);
                            }
                            return;
                          }
                          commitPick(detail);
                        }}
                      >
                        {detail.id === currentExerciseId
                          ? "Current exercise"
                          : pickAction
                            ? pickAction
                            : preExistingIds.has(detail.id)
                              ? "In this workout — tap to remove"
                              : newlySelectedCount +
                                    (selectedIds.has(detail.id) ? 0 : 1) >
                                  1
                                ? `Add ${newlySelectedCount + (selectedIds.has(detail.id) ? 0 : 1)} exercises to workout`
                                : "Add to workout"}
                      </Button>
                      <Button
                        variant="ghost"
                        fullWidth
                        className="mt-2"
                        disabled={saving}
                        ref={progressActionRef}
                        onClick={() => viewProgress(detail.name)}
                      >
                        View full progress
                      </Button>
                    </>
                  )}
                </div>
              </>
            )}
          </BottomSheet>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}

/** One picker row: the exercise's picture (`ExerciseThumb`, as on Train's
 *  list, so the drawing where there is one and the category's muscles
 *  where there is not), name and meta, and a lifting-tinted selection
 *  state. Tapping the picture or the name opens the exercise's form. With
 *  a `pickAction` the circle does that action rather than ticking. */
function ExerciseRow({
  exercise,
  isSelected,
  isRemoving = false,
  isCurrent = false,
  pickAction,
  onPick,
  onToggle,
  onOpen,
}: {
  exercise: Exercise;
  isSelected: boolean;
  isRemoving?: boolean;
  /** The exercise being replaced: shown, never offered. */
  isCurrent?: boolean;
  pickAction?: string;
  onPick: (exercise: Exercise) => void;
  onToggle: (id: string) => void;
  onOpen: (exercise: Exercise) => void;
}) {
  return (
    <div
      className={cn(
        "w-full flex items-center gap-2 pl-3 pr-1.5 py-1.5 rounded-xl border transition-colors min-h-[64px]",
        isSelected
          ? "bg-lifting/8 border-lifting/40"
          : "bg-card border-border/40"
      )}
    >
      {/* Body → detail sheet (owner request 2026-09-02: tap to SEE it). */}
      <button
        type="button"
        onClick={() => onOpen(exercise)}
        aria-label={`${exercise.name} details`}
        className="flex-1 min-w-0 flex items-center gap-3 text-left min-h-[44px] active:opacity-80"
      >
        <ExerciseThumb exerciseId={exercise.id} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">
            {exercise.name}
          </p>
          <p className="text-caption text-muted-foreground truncate mt-0.5">
            {exercise.muscleGroup} · {exercise.equipment}
          </p>
        </div>
      </button>
      {/* Trailing circle → select/unselect. Keeps the checkbox role the
          batch-add flow is built on; the 44px target is the button, the
          32px circle is its visual. */}
      {isCurrent ? (
        <span className="w-16 shrink-0 text-center text-caption font-semibold text-muted-foreground">
          Current
        </span>
      ) : pickAction ? (
        <button
          type="button"
          aria-label={`${pickAction}: ${exercise.name}`}
          onClick={() => onPick(exercise)}
          className="size-11 shrink-0 flex items-center justify-center rounded-full active:scale-[0.97] transition-transform"
        >
          <span className="size-8 rounded-full border-[1.5px] border-border flex items-center justify-center">
            <ArrowLeftRight className="size-4 text-muted-foreground" />
          </span>
        </button>
      ) : (
        <button
          type="button"
          role="checkbox"
          aria-checked={isSelected}
          aria-label={exercise.name}
          onClick={() => onToggle(exercise.id)}
          disabled={isRemoving}
          className="size-11 shrink-0 flex items-center justify-center rounded-full active:scale-[0.97] transition-transform"
        >
          {isSelected ? (
            <span
              className="size-8 rounded-full flex items-center justify-center"
              style={{ backgroundColor: THEME.lifting }}
            >
              <Check className="size-4 text-white" />
            </span>
          ) : (
            <span className="size-8 rounded-full border-[1.5px] border-border flex items-center justify-center">
              <Plus className="size-4 text-muted-foreground" />
            </span>
          )}
        </button>
      )}
    </div>
  );
}
