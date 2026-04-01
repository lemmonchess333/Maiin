import { useState, useEffect, useRef, useLayoutEffect, memo } from "react";
import { Drawer } from "vaul";
import Model, { type IExerciseData, type Muscle } from "react-body-highlighter";
import { getExerciseDemo, mapMuscles, needsPosterior, needsAnterior, type ExerciseDemo } from "@/lib/exerciseDemo";
import { ChevronDown, ChevronUp } from "lucide-react";
import { THEME } from "@/lib/theme";

interface Props {
  exerciseName: string;
  open: boolean;
  onClose: () => void;
}

function ExerciseDemoCard({ exerciseName, open, onClose }: Props) {
  const [demo, setDemo] = useState<ExerciseDemo | null>(null);
  const [loading, setLoading] = useState(true);
  const [showInstructions, setShowInstructions] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const instructionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const load = async () => {
      setLoading(true);
      setShowInstructions(false);
      const d = await getExerciseDemo(exerciseName);
      setDemo(d);
      setLoading(false);
    };
    load();
  }, [exerciseName, open]);

  useLayoutEffect(() => {
    if (instructionsRef.current) {
      setOverflows(instructionsRef.current.scrollHeight > 60);
    }
  }, [demo]);

  const primaryMapped = demo ? mapMuscles(demo.primaryMuscles) as Muscle[] : [];
  const secondaryMapped = demo ? mapMuscles(demo.secondaryMuscles) as Muscle[] : [];
  const allMuscles = [...primaryMapped, ...secondaryMapped];
  const showFront = needsAnterior(allMuscles);
  const showBack = needsPosterior(allMuscles);
  const showBoth = showFront && showBack;

  const highlightData: IExerciseData[] = [
    ...(primaryMapped.length > 0
      ? [
          { name: "Primary1" as const, muscles: primaryMapped },
          { name: "Primary2" as const, muscles: primaryMapped },
        ]
      : []),
    ...(secondaryMapped.length > 0
      ? [{ name: "Secondary" as const, muscles: secondaryMapped }]
      : []),
  ];

  return (
    <Drawer.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/50 z-[102]" />
        <Drawer.Content className="fixed bottom-0 left-0 right-0 z-[103] rounded-t-2xl bg-background border-t border-border max-h-[85vh] flex flex-col">
          <div className="overflow-y-auto flex-1 px-5 pb-6 pt-3">
            {/* Drag handle */}
            <div className="w-9 h-1 rounded-full bg-border mx-auto" />

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : !demo ? (
              <div className="text-center py-8 space-y-3">
                <div className="flex justify-center gap-4">
                  <div className="opacity-30">
                    <Model data={[]} style={{ width: "120px", padding: "0" }} type="anterior" />
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">No demo available for this exercise</p>
                <p className="text-lg font-semibold text-foreground">{exerciseName}</p>
              </div>
            ) : (
              <div>
                {/* Exercise name */}
                <h3 className="text-2xl font-bold text-foreground mt-5">{demo.name}</h3>

                {/* Metadata tags */}
                <div className="flex items-center gap-2 mt-6">
                  {demo.category && (
                    <span className="inline-flex items-center justify-center whitespace-nowrap h-7 px-3 rounded-full text-[13px] font-semibold text-white"
                      style={{ backgroundColor: THEME.lifting }}>
                      {demo.category}
                    </span>
                  )}
                  {demo.equipment && (
                    <span className="inline-flex items-center justify-center whitespace-nowrap h-7 px-3 rounded-full text-[13px] font-medium border-[1.5px] border-border text-foreground/80">
                      {demo.equipment}
                    </span>
                  )}
                </div>

                {/* Muscle diagrams */}
                <div className="bg-muted rounded-2xl p-5 mt-4">
                  <div style={{ display: "flex", justifyContent: "center", gap: showBoth ? 16 : 0 }}>
                    {(showFront || (!showFront && !showBack)) && (
                      <div style={{ textAlign: "center", maxWidth: showBoth ? "45%" : "60%", overflow: "hidden" }}>
                        <div style={{ height: showBoth ? 180 : 220, overflow: "hidden" }}>
                          <Model
                            data={highlightData}
                            style={{ width: showBoth ? "100%" : "160px", height: showBoth ? "180px" : "220px", padding: "0", margin: "0 auto" }}
                            svgStyle={{ maxHeight: "100%", maxWidth: "100%" }}
                            type="anterior"
                            highlightedColors={[THEME.liftingLight, THEME.lifting]}
                          />
                        </div>
                        <p className="text-xs mt-2" style={{ color: THEME.text.muted }}>Front</p>
                      </div>
                    )}
                    {showBack && (
                      <div style={{ textAlign: "center", maxWidth: showBoth ? "45%" : "60%", overflow: "hidden" }}>
                        <div style={{ height: showBoth ? 180 : 220, overflow: "hidden" }}>
                          <Model
                            data={highlightData}
                            style={{ width: showBoth ? "100%" : "160px", height: showBoth ? "180px" : "220px", padding: "0", margin: "0 auto" }}
                            svgStyle={{ maxHeight: "100%", maxWidth: "100%" }}
                            type="posterior"
                            highlightedColors={[THEME.liftingLight, THEME.lifting]}
                          />
                        </div>
                        <p className="text-xs mt-2" style={{ color: THEME.text.muted }}>Back</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Primary / Secondary muscle pills */}
                <div className="mt-4">
                  {demo.primaryMuscles.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-medium text-muted-foreground/50 mr-1">Primary:</span>
                      {demo.primaryMuscles.map((m) => (
                        <span key={m} className="inline-flex items-center whitespace-nowrap h-6 px-2.5 rounded-xl text-[13px] font-medium"
                          style={{ backgroundColor: THEME.lifting + "14", color: THEME.lifting }}>
                          {m}
                        </span>
                      ))}
                    </div>
                  )}
                  {demo.secondaryMuscles.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 mt-3">
                      <span className="text-[11px] font-medium text-muted-foreground/50 mr-1">Secondary:</span>
                      {demo.secondaryMuscles.map((m) => (
                        <span key={m} className="inline-flex items-center whitespace-nowrap h-6 px-2.5 rounded-xl text-[13px] font-medium bg-muted text-foreground/70">
                          {m}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Instructions */}
                {demo.instructions.length > 0 && (
                  <div className="mt-6">
                    <p className="text-lg font-bold text-foreground">Instructions</p>
                    <div
                      ref={instructionsRef}
                      className={`relative overflow-hidden transition-all duration-300 ${
                        overflows && !showInstructions ? "max-h-[60px]" : "max-h-[2000px]"
                      }`}
                    >
                      <div className="flex flex-col gap-4 mt-3">
                        {demo.instructions.map((step, i) => (
                          <div key={i} className="flex gap-2">
                            <span className="text-[15px] font-bold shrink-0" style={{ color: THEME.lifting }}>{i + 1}.</span>
                            <p className="text-[15px] text-foreground/80 leading-relaxed">{step}</p>
                          </div>
                        ))}
                      </div>
                      {overflows && !showInstructions && (
                        <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-background to-transparent" />
                      )}
                    </div>
                    {overflows && (
                      <button
                        onClick={() => setShowInstructions(!showInstructions)}
                        className="flex items-center gap-1 mt-2 text-[15px] font-medium"
                        style={{ color: THEME.lifting }}
                      >
                        {showInstructions ? (
                          <><ChevronUp className="w-4 h-4" /> Hide</>
                        ) : (
                          <><ChevronDown className="w-4 h-4" /> Show full instructions</>
                        )}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

export default memo(ExerciseDemoCard);
