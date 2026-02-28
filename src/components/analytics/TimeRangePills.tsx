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
    <div className="flex items-center gap-1 p-1 rounded-xl bg-[#1C1C24]">
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${
            selected === opt ? 'bg-[#2A2A35] text-white shadow-sm' : 'text-white/30 hover:text-white/50'
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}
