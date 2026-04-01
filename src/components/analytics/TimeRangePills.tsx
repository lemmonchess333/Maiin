interface TimeRangePillsProps {
  options?: string[];
  selected: string;
  onChange: (value: string) => void;
}

export default function TimeRangePills({
  options = ['1W', '1M', '3M', '6M', '1Y'],
  selected,
  onChange,
}: TimeRangePillsProps) {
  return (
    <div className="flex items-center gap-1 p-1 rounded-xl bg-muted">
      {options.map((opt) => (
        <button key={opt} onClick={() => onChange(opt)}
          className={`flex-1 py-2.5 rounded-lg text-xs font-medium transition-all ${
            selected === opt
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}>
          {opt}
        </button>
      ))}
    </div>
  );
}
