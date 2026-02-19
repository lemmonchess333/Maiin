import { useProgram } from "@/features/program/useProgram";

export default function Program() {

  const program = useProgram({
    currentWeek: 2,
    primaryTrend: 0.03,
    fatigueScore: 14,
  });

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Program Engine</h1>

      <div className="mt-4">
        <p>Week: {program.week}</p>
        <p>Intensity Multiplier: {program.intensityMultiplier.toFixed(2)}</p>
        <p>Volume Modifier: {program.volumeModifier.toFixed(2)}</p>
        <p>{program.deload ? "Deload Week" : "Progression Week"}</p>
      </div>
    </div>
  );
}