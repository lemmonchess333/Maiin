import {
  useState,
  useMemo,
  useRef,
  useEffect,
  useEffectEvent,
  useCallback,
} from "react";
import { createPortal } from "react-dom";
import { EXERCISE_CATEGORIES, getExercisesByCategory } from "@/lib/exercises";
import type { Exercise } from "@/lib/exercises";
import { cn } from "@/lib/utils";
import { THEME } from "@/lib/theme";
import { Search, X, Plus, Check, Dumbbell } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { haptic } from "@/lib/haptic";
import { categoryFigureUri } from "@/lib/muscleFigureSvg";
import { useWorkouts } from "@/hooks/useWorkouts";
import SectionLabel from "@/components/ui/SectionLabel";
import { Button } from "@/components/ui/Button";

const ALL_CATEGORIES = ["All", ...EXERCISE_CATEGORIES] as const;

interface Props {
  open: boolean;
  onSelect: (exercise: Exercise) => void;
  onMultiSelect?: (exercises: Exercise[]) => void;
  onClose: () => void;
  headerTitle?: string;
  existingExerciseIds?: string[];
  onRemoveExercise?: (exerciseId: string) => void;
}

export default function ExercisePicker({
  open,
  onSelect,
  onMultiSelect,
  onClose,
  headerTitle = "Select Exercise",
  existingExerciseIds,
  onRemoveExercise,
}: Props) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(existingExerciseIds ?? [])
  );
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const preExistingIds = useMemo(
    () => new Set(existingExerciseIds ?? []),
    [existingExerciseIds]
  );

  const filteredExercises = useMemo(() => {
    const getAll = () =>
      EXERCISE_CATEGORIES.flatMap((cat) => getExercisesByCategory(cat));
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return getAll().filter((e) => e.name.toLowerCase().includes(q));
    }
    if (selectedCategory === "All") return getAll();
    return getExercisesByCategory(selectedCategory);
  }, [searchQuery, selectedCategory]);

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

  const toggleSelection = (id: string) => {
    haptic("light");
    if (preExistingIds.has(id)) {
      if (selectedIds.has(id)) {
        onRemoveExercise?.(id);
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      } else {
        setSelectedIds((prev) => new Set(prev).add(id));
      }
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    }
  };

  const handleAddSelected = () => {
    const newlySelected = allExercises.filter(
      (e) => selectedIds.has(e.id) && !preExistingIds.has(e.id)
    );
    if (newlySelected.length === 0) {
      onClose();
      return;
    }
    if (onMultiSelect) {
      onMultiSelect(newlySelected);
    } else {
      for (const ex of newlySelected) onSelect(ex);
    }
    setSelectedIds(new Set(preExistingIds));
    onClose();
  };

  const handleClose = useCallback(() => {
    if (newlySelectedCount >= 2) {
      setShowDiscardConfirm(true);
    } else {
      setSelectedIds(new Set(preExistingIds));
      onClose();
    }
  }, [newlySelectedCount, preExistingIds, onClose]);

  // Close on Escape key. handleClose wrapped in useEffectEvent so
  // the listener stays subscribed across handleClose identity
  // changes (which happen whenever the useCallback deps change).
  const escapeHandleClose = useEffectEvent(handleClose);
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") escapeHandleClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const confirmDiscard = () => {
    setShowDiscardConfirm(false);
    setSelectedIds(new Set(preExistingIds));
    onClose();
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
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0"
            style={{ zIndex: 9998, backgroundColor: "rgba(0,0,0,0.4)" }}
            onClick={handleClose}
          />

          <motion.div
            key="picker-modal"
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
              <p
                className="text-foreground"
                style={{ fontSize: 17, fontWeight: 600 }}
              >
                {headerTitle}
              </p>
              <div style={{ width: 32 }} />
            </div>

            {/* Discard confirmation */}
            <AnimatePresence>
              {showDiscardConfirm && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden px-4 pb-3"
                >
                  <div className="flex items-center justify-between p-3 rounded-xl bg-muted">
                    <p className="text-sm text-foreground">
                      Discard {newlySelectedCount} selections?
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowDiscardConfirm(false)}
                        className="px-3 py-1.5 text-xs font-medium text-muted-foreground rounded-lg hover:bg-card"
                      >
                        Keep Browsing
                      </button>
                      <button
                        type="button"
                        onClick={confirmDiscard}
                        className="px-3 py-1.5 text-xs font-medium text-destructive bg-destructive/10 rounded-lg"
                      >
                        Discard
                      </button>
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
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search exercises..."
                  aria-label="Search exercises"
                  className="w-full pl-9 pr-4 h-11 text-sm text-foreground placeholder:text-muted-foreground bg-muted rounded-xl border-none focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
              <AnimatePresence>
                {searchQuery && (
                  <motion.button
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: "auto" }}
                    exit={{ opacity: 0, width: 0 }}
                    transition={{ duration: 0.2 }}
                    onClick={cancelSearch}
                    className="text-sm font-medium shrink-0 overflow-hidden text-primary"
                  >
                    Cancel
                  </motion.button>
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
                  className={cn(
                    "h-10 px-4 rounded-full text-small whitespace-nowrap transition-colors shrink-0",
                    selectedCategory === cat
                      ? "font-semibold text-white bg-primary"
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
              {!searchQuery &&
                selectedCategory === "All" &&
                recentExercises.length > 0 && (
                  <>
                    <SectionLabel className="pt-1 pb-2">Recent</SectionLabel>
                    <div className="space-y-1.5 mb-4">
                      {recentExercises.map((exercise) => (
                        <ExerciseRow
                          key={`recent-${exercise.id}`}
                          exercise={exercise}
                          isSelected={selectedIds.has(exercise.id)}
                          onToggle={toggleSelection}
                        />
                      ))}
                    </div>
                  </>
                )}

              <SectionLabel className="pt-1 pb-2">
                {searchQuery
                  ? `Results · ${filteredExercises.length}`
                  : `${selectedCategory === "All" ? "All" : selectedCategory} · ${filteredExercises.length} exercises`}
              </SectionLabel>
              <div className="space-y-1.5">
                {filteredExercises.map((exercise) => (
                  <ExerciseRow
                    key={exercise.id}
                    exercise={exercise}
                    isSelected={selectedIds.has(exercise.id)}
                    onToggle={toggleSelection}
                  />
                ))}
              </div>
              {filteredExercises.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 px-8">
                  <Search className="size-12 text-muted-foreground/30 mb-3" />
                  <p className="text-base font-semibold text-foreground">
                    No exercises found
                  </p>
                  <p className="text-sm text-muted-foreground mt-1 text-center">
                    Try a different search term or browse by muscle group
                  </p>
                </div>
              )}
            </div>

            {/* Batch selection bar */}
            <AnimatePresence>
              {newlySelectedCount > 0 && (
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
                    onClick={handleAddSelected}
                  >
                    {newlySelectedCount} exercise
                    {newlySelectedCount !== 1 ? "s" : ""} selected — Add to
                    workout
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}

/** One picker row — compact card grammar: anatomy-figure tile (shared
 *  data-URI per category, cheap in a 151-row list), name + meta, and a
 *  lifting-tinted selection state (the old green + floating plus-circle
 *  predates the token guardrail). */
function ExerciseRow({
  exercise,
  isSelected,
  onToggle,
}: {
  exercise: Exercise;
  isSelected: boolean;
  onToggle: (id: string) => void;
}) {
  const figure = categoryFigureUri(exercise.category);
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={isSelected}
      aria-label={exercise.name}
      onClick={() => onToggle(exercise.id)}
      className={cn(
        "w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-colors min-h-[64px]",
        isSelected
          ? "bg-lifting/8 border-lifting/40"
          : "bg-card border-border/40 active:bg-muted/60"
      )}
    >
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 overflow-hidden"
        style={{ background: `${THEME.lifting}0F` }}
      >
        {figure ? (
          <img src={figure} alt="" aria-hidden className="h-9 w-auto" />
        ) : (
          <Dumbbell className="size-4" style={{ color: THEME.lifting }} />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground truncate">
          {exercise.name}
        </p>
        <p className="text-caption text-muted-foreground truncate mt-0.5">
          {exercise.muscleGroup} · {exercise.equipment}
        </p>
      </div>
      <div className="shrink-0">
        {isSelected ? (
          <div
            className="size-8 rounded-full flex items-center justify-center"
            style={{ backgroundColor: THEME.lifting }}
          >
            <Check className="size-4 text-white" />
          </div>
        ) : (
          <div className="size-8 rounded-full border-[1.5px] border-border flex items-center justify-center">
            <Plus className="size-4 text-muted-foreground" />
          </div>
        )}
      </div>
    </button>
  );
}
