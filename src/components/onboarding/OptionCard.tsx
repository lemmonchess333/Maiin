import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { THEME } from "@/lib/theme";
import { motion } from "framer-motion";

interface OptionCardProps {
  selected: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  label: string;
  desc?: string;
  disabled?: boolean;
  /** Stagger index — controls entrance delay */
  index?: number;
}

export default function OptionCard({ selected, onSelect, icon, label, desc, disabled, index = 0 }: OptionCardProps) {
  return (
    <motion.button
      onClick={onSelect}
      disabled={disabled}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.06, ease: [0.32, 0.72, 0, 1] }}
      className={cn(
        "w-full flex items-center gap-3 p-4 rounded-2xl text-left transition-all active:scale-[0.95]",
        disabled && "opacity-30 pointer-events-none"
      )}
      style={{
        background: selected ? `${THEME.teal}18` : "rgba(255,255,255,0.05)",
        border: `1px solid ${selected ? THEME.teal + "50" : "rgba(255,255,255,0.08)"}`,
      }}
    >
      <span className="text-xl flex-shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">{label}</p>
        {desc && (
          <p className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
            {desc}
          </p>
        )}
      </div>
      {selected && !disabled && (
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 500, damping: 25 }}
        >
          <Check className="w-4 h-4 flex-shrink-0" style={{ color: THEME.teal }} />
        </motion.span>
      )}
    </motion.button>
  );
}
