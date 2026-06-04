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

export default function OptionCard({
  selected,
  onSelect,
  icon,
  label,
  desc,
  disabled,
  index = 0,
}: OptionCardProps) {
  // Surface + border + text colours use design-system tokens (bg-card,
  // border-border, text-muted-foreground) so the card renders correctly in
  // both light and dark mode. The selected accent uses THEME.brand (purple)
  // to match the rest of onboarding and the Continue CTA — previously this
  // was THEME.teal, which read as an inconsistent blue tint against the
  // purple flow. Pre-Sprint-2 the hardcoded rgba(255,255,255,0.05) assumed a
  // dark background, which is why onboarding once looked black in light mode.
  return (
    <motion.button
      onClick={onSelect}
      disabled={disabled}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.3,
        delay: index * 0.06,
        ease: [0.32, 0.72, 0, 1],
      }}
      className={cn(
        "w-full flex items-center gap-3 p-4 rounded-2xl text-left transition-all active:scale-[0.97]",
        "bg-card text-foreground border",
        selected ? "border-transparent" : "border-border",
        disabled && "opacity-30 pointer-events-none",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      )}
      style={{
        // Selected state: purple-tinted card + purple border. Token-
        // backed `bg-card` is the unselected baseline; the inline
        // override only applies when selected, so light mode shows
        // white card with purple tint and dark mode shows #1A surface
        // with the same tint.
        ...(selected
          ? {
              background: `${THEME.brand}18`,
              borderColor: `${THEME.brand}50`,
            }
          : {}),
      }}
    >
      <span className="text-xl flex-shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">{label}</p>
        {desc && <p className="text-xs text-muted-foreground">{desc}</p>}
      </div>
      {selected && !disabled && (
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 500, damping: 25 }}
        >
          <Check
            className="size-4 flex-shrink-0"
            style={{ color: THEME.brand }}
          />
        </motion.span>
      )}
    </motion.button>
  );
}
