import { useState, useEffect, useRef, useLayoutEffect, memo } from "react";
import { Drawer } from "vaul";
import Model, { type IExerciseData, type Muscle } from "react-body-highlighter";
import { getExerciseDemo, mapMuscles, needsPosterior, type ExerciseDemo } from "@/lib/exerciseDemo";
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
      setOverflows(instructionsRef.current.scrollHeight > 80);
    }
  }, [demo]);

  const primaryMapped = demo ? mapMuscles(demo.primaryMuscles) as Muscle[] : [];
  const secondaryMapped = demo ? mapMuscles(demo.secondaryMuscles) as Muscle[] : [];
  const showPosterior = needsPosterior([...primaryMapped, ...secondaryMapped]);

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
        <Drawer.Overlay className="fixed inset-0 bg-black/50 z-40" />
        <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl bg-background border-t border-border max-h-[85vh] flex flex-col">
          <div className="overflow-y-auto flex-1 px-5 pt-4 pb-6">
            {/* Handle */}
            <div className="w-10 h-1 rounded-full bg-border mx-auto mb-4" />

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : !demo ? (
              <div className="text-center py-8 space-y-3">
                <div className="flex justify-center gap-4">
                  <div className="opacity-30">
                    <Model
                      data={[]}
                      style={{ width: "120px", padding: "0" }}
                      type="anterior"
                    />
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">No demo available for this exercise</p>
                <p className="text-lg font-semibold text-foreground">{exerciseName}</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Title + tags */}
                <div>
                  <h3 className="text-lg font-bold text-foreground">{demo.name}</h3>
                  <div className="flex gap-2 mt-1.5">
                    {demo.category && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                        {demo.category}
                      </span>
                    )}
                    {demo.equipment && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                        {demo.equipment}
                      </span>
                    )}
                  </div>
                </div>

                {/* Muscle highlighter */}
                <div className="flex justify-center gap-2">
                  <div>
                    <Model
                      data={highlightData}
                      style={{ width: "140px", padding: "0" }}
                      type="anterior"
                      highlightedColors={["#7B72E9", "#b8b0e8"]}
                    />
                    <p className="text-[11px] text-muted-foreground text-center mt-1">Front</p>
                  </div>
                  {showPosterior && (
                    <div>
                      <Model
                        data={highlightData}
                        style={{ width: "140px", padding: "0" }}
                        type="posterior"
                        highlightedColors={["#7B72E9", "#b8b0e8"]}
                      />
                      <p className="text-[11px] text-muted-foreground text-center mt-1">Back</p>
                    </div>
                  )}
                </div>

                {/* Muscle tags */}
                <div className="space-y-1.5">
                  {demo.primaryMuscles.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      <span className="text-[11px] text-muted-foreground font-medium mr-1">Primary:</span>
                      {demo.primaryMuscles.map((m) => (
                        <span key={m} className="text-[11px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                          {m}
                        </span>
                      ))}
                    </div>
                  )}
                  {demo.secondaryMuscles.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      <span className="text-[11px] text-muted-foreground font-medium mr-1">Secondary:</span>
                      {demo.secondaryMuscles.map((m) => (
                        <span key={m} className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                          {m}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Instructions */}
                {demo.instructions.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-foreground mb-2">Instructions</p>
                    <div
                      ref={instructionsRef}
                      className={`relative overflow-hidden transition-all duration-300 ${
                        overflows && !showInstructions ? "max-h-20" : "max-h-[1000px]"
                      }`}
                    >
                      <ol className="space-y-2 list-decimal list-inside">
                        {demo.instructions.map((step, i) => (
                          <li key={i} className="text-xs text-muted-foreground leading-relaxed">
                            {step}
                          </li>
                        ))}
                      </ol>
                      {overflows && !showInstructions && (
                        <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-background to-transparent" />
                      )}
                    </div>
                    {overflows && (
                      <button
                        onClick={() => setShowInstructions(!showInstructions)}
                        className="flex items-center gap-1 mt-1.5 text-xs font-medium text-primary"
                      >
                        {showInstructions ? (
                          <>
                            <ChevronUp className="w-3.5 h-3.5" /> Hide
                          </>
                        ) : (
                          <>
                            <ChevronDown className="w-3.5 h-3.5" /> Show full instructions
                          </>
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
