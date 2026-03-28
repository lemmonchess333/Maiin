import { useState, useEffect, useRef, useLayoutEffect, memo } from "react";
import { Drawer } from "vaul";
import Model, { type IExerciseData, type Muscle } from "react-body-highlighter";
import { getExerciseDemo, mapMuscles, needsPosterior, needsAnterior, type ExerciseDemo } from "@/lib/exerciseDemo";
import { ChevronDown, ChevronUp } from "lucide-react";

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
      ? [{ name: "Primary" as const, muscles: primaryMapped }]
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
          <div className="overflow-y-auto flex-1" style={{ padding: "12px 20px 24px" }}>
            {/* Drag handle */}
            <div style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: "#D1D1D6", margin: "0 auto" }} />

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
                <h3 style={{ fontSize: 24, fontWeight: 700, color: "#1C1C1E", marginTop: 20 }}>{demo.name}</h3>

                {/* Metadata tags */}
                <div className="flex items-center" style={{ gap: 8, marginTop: 24 }}>
                  {demo.category && (
                    <span className="inline-flex items-center justify-center whitespace-nowrap" style={{
                      height: 28, paddingLeft: 12, paddingRight: 12, borderRadius: 14,
                      backgroundColor: "#7C6BF0", color: "white", fontSize: 13, fontWeight: 600,
                    }}>
                      {demo.category}
                    </span>
                  )}
                  {demo.equipment && (
                    <span className="inline-flex items-center justify-center whitespace-nowrap" style={{
                      height: 28, paddingLeft: 12, paddingRight: 12, borderRadius: 14,
                      backgroundColor: "transparent", border: "1.5px solid #D1D1D6", color: "#3C3C43", fontSize: 13, fontWeight: 500,
                    }}>
                      {demo.equipment}
                    </span>
                  )}
                </div>

                {/* Muscle diagrams — smart view selection with hard overflow constraints */}
                <div style={{ backgroundColor: "#F8F8FA", borderRadius: 16, padding: "20px 16px", marginTop: 16 }}>
                  <div style={{ display: "flex", justifyContent: "center", gap: showBoth ? 16 : 0 }}>
                    {(showFront || (!showFront && !showBack)) && (
                      <div style={{ textAlign: "center", maxWidth: showBoth ? "45%" : "60%", overflow: "hidden" }}>
                        <div style={{ height: showBoth ? 180 : 220, overflow: "hidden" }}>
                          <Model
                            data={highlightData}
                            style={{ width: showBoth ? "100%" : "160px", height: showBoth ? "180px" : "220px", padding: "0", margin: "0 auto" }}
                            svgStyle={{ maxHeight: "100%", maxWidth: "100%" }}
                            type="anterior"
                            highlightedColors={["#7B72E9", "#b8b0e8"]}
                          />
                        </div>
                        <p style={{ fontSize: 12, color: "#8E8E93", marginTop: 8 }}>Front</p>
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
                            highlightedColors={["#7B72E9", "#b8b0e8"]}
                          />
                        </div>
                        <p style={{ fontSize: 12, color: "#8E8E93", marginTop: 8 }}>Back</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Primary / Secondary muscle pills */}
                <div style={{ marginTop: 16 }}>
                  {demo.primaryMuscles.length > 0 && (
                    <div className="flex flex-wrap items-center" style={{ gap: 8 }}>
                      <span style={{ fontSize: 11, fontWeight: 500, color: "#C7C7CC", marginRight: 4 }}>Primary:</span>
                      {demo.primaryMuscles.map((m) => (
                        <span key={m} className="inline-flex items-center whitespace-nowrap" style={{
                          height: 24, paddingLeft: 10, paddingRight: 10, borderRadius: 12,
                          backgroundColor: "#F0EDFD", color: "#7C6BF0", fontSize: 13, fontWeight: 500,
                        }}>
                          {m}
                        </span>
                      ))}
                    </div>
                  )}
                  {demo.secondaryMuscles.length > 0 && (
                    <div className="flex flex-wrap items-center" style={{ gap: 8, marginTop: 12 }}>
                      <span style={{ fontSize: 11, fontWeight: 500, color: "#C7C7CC", marginRight: 4 }}>Secondary:</span>
                      {demo.secondaryMuscles.map((m) => (
                        <span key={m} className="inline-flex items-center whitespace-nowrap" style={{
                          height: 24, paddingLeft: 10, paddingRight: 10, borderRadius: 12,
                          backgroundColor: "#F2F2F7", color: "#3C3C43", fontSize: 13, fontWeight: 500,
                        }}>
                          {m}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Instructions */}
                {demo.instructions.length > 0 && (
                  <div style={{ marginTop: 24 }}>
                    <p style={{ fontSize: 18, fontWeight: 700, color: "#1C1C1E" }}>Instructions</p>
                    <div
                      ref={instructionsRef}
                      className={`relative overflow-hidden transition-all duration-300 ${
                        overflows && !showInstructions ? "max-h-[60px]" : "max-h-[2000px]"
                      }`}
                      style={{ marginTop: 12 }}
                    >
                      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                        {demo.instructions.map((step, i) => (
                          <div key={i} style={{ display: "flex", gap: 8 }}>
                            <span style={{ fontSize: 15, fontWeight: 700, color: "#7C6BF0", flexShrink: 0 }}>{i + 1}.</span>
                            <p style={{ fontSize: 15, fontWeight: 400, color: "#3C3C43", lineHeight: 1.5 }}>{step}</p>
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
                        className="flex items-center gap-1"
                        style={{ marginTop: 8, fontSize: 15, fontWeight: 500, color: "#7C6BF0" }}
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
