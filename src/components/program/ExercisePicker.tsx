import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { EXERCISE_CATEGORIES, getExercisesByCategory } from "@/lib/exercises";
import type { Exercise } from "@/lib/exercises";
import { cn } from "@/lib/utils";
import { Search, X, Plus, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { haptic } from "@/lib/haptic";

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

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, handleClose]);

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
                className="size-8 flex items-center justify-center rounded-full bg-muted"
              >
                <X className="size-4 text-muted-foreground" />
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
                        className="px-3 py-1.5 text-xs font-medium text-red-500 bg-red-500/10 rounded-lg"
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
                  className="w-full pl-9 pr-4 h-11 text-sm text-foreground placeholder:text-muted-foreground bg-muted"
                  style={{ borderRadius: 10, border: "none" }}
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
              className="flex overflow-x-auto gap-2 px-4 pb-2"
              style={{ scrollbarWidth: "none" }}
            >
              {ALL_CATEGORIES.map((cat) => (
                <button
                  type="button"
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={cn(
                    "h-9 px-3.5 rounded-full text-[13px] whitespace-nowrap transition-colors shrink-0",
                    selectedCategory === cat
                      ? "font-semibold text-white bg-primary"
                      : "font-normal bg-transparent border-[1.5px] border-border text-foreground"
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Section label */}
            {!searchQuery && (
              <div
                className="px-4 pt-1 pb-2 text-muted-foreground uppercase"
                style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.5 }}
              >
                {selectedCategory === "All"
                  ? `All · ${filteredExercises.length} exercises`
                  : `${selectedCategory} · ${filteredExercises.length} exercises`}
              </div>
            )}

            {/* Exercise list */}
            <div className="flex-1 overflow-y-auto min-h-0">
              {filteredExercises.map((exercise, idx) => {
                const isSelected = selectedIds.has(exercise.id);

                return (
                  <div key={exercise.id}>
                    {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
                    <div
                      onClick={() => toggleSelection(exercise.id)}
                      className={cn(
                        "flex items-center pr-4 transition-colors duration-100 active:bg-muted cursor-pointer",
                        isSelected && "bg-green-500/10"
                      )}
                      style={{
                        paddingLeft: 16,
                        paddingTop: 12,
                        paddingBottom: 12,
                        minHeight: 68,
                      }}
                    >
                      <div className="flex-1 min-w-0">
                        <p
                          className="text-foreground"
                          style={{
                            fontSize: 17,
                            fontWeight: 600,
                            lineHeight: 1.25,
                          }}
                        >
                          {exercise.name}
                        </p>
                        <p
                          className="text-muted-foreground"
                          style={{ fontSize: 13, marginTop: 2 }}
                        >
                          {exercise.muscleGroup} · {exercise.equipment}
                        </p>
                      </div>

                      <div className="shrink-0 ml-3">
                        <motion.div
                          initial={false}
                          animate={{ scale: isSelected ? [0.9, 1] : 1 }}
                          transition={{ duration: 0.15 }}
                          className="size-9 rounded-full flex items-center justify-center"
                          style={{
                            backgroundColor: isSelected ? "#4CAF50" : "#7C6BF0",
                          }}
                        >
                          {isSelected ? (
                            <Check className="size-4 text-white" />
                          ) : (
                            <Plus className="size-4 text-white" />
                          )}
                        </motion.div>
                      </div>
                    </div>
                    {/* Indented divider */}
                    {idx < filteredExercises.length - 1 && (
                      <div
                        className="bg-border"
                        style={{ height: 0.5, marginLeft: 16 }}
                      />
                    )}
                  </div>
                );
              })}
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
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={handleAddSelected}
                    className="w-full py-3.5 text-white font-semibold text-[15px] flex items-center justify-center gap-2"
                    style={{
                      backgroundColor: "#7C6BF0",
                      borderRadius: 14,
                      boxShadow: "0 6px 24px rgba(124,107,240,0.3)",
                    }}
                  >
                    {newlySelectedCount} exercise
                    {newlySelectedCount !== 1 ? "s" : ""} selected — Add to
                    workout
                  </motion.button>
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
