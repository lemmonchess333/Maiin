interface StepperProps {
  label: string;
  value: number;
  displayValue?: string;
  onDecrement: () => void;
  onIncrement: () => void;
  unit?: string;
}

export default function Stepper({ label, value, displayValue, onDecrement, onIncrement, unit }: StepperProps) {
  return (
    <div
      className="rounded-2xl p-4 text-center"
      style={{
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.1)",
      }}
    >
      <p
        className="text-xs uppercase tracking-wider mb-2"
        style={{ color: "rgba(255,255,255,0.4)" }}
      >
        {label}
      </p>
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={onDecrement}
          className="w-8 h-8 rounded-full flex items-center justify-center text-lg font-bold active:scale-[0.95]"
          style={{ background: "rgba(255,255,255,0.1)" }}
        >
          −
        </button>
        <span className="text-xl font-bold font-mono tabular-nums min-w-[60px] text-center">
          {displayValue ?? value}
        </span>
        <button
          onClick={onIncrement}
          className="w-8 h-8 rounded-full flex items-center justify-center text-lg font-bold active:scale-[0.95]"
          style={{ background: "rgba(255,255,255,0.1)" }}
        >
          +
        </button>
      </div>
      {unit && (
        <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.25)" }}>
          {unit}
        </p>
      )}
    </div>
  );
}
