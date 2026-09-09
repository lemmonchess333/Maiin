import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  createContext,
  use,
} from "react";
import { THEME } from "@/lib/theme";
import { motion, AnimatePresence } from "framer-motion";
import { Trophy, CheckCircle, Bell } from "lucide-react";

type BubbleVariant = "pr" | "complete" | "generic";

interface BubbleData {
  id: number;
  title: string;
  subtitle?: string;
  variant: BubbleVariant;
}

interface NotificationBubbleContextValue {
  showBubble: (
    title: string,
    subtitle?: string,
    variant?: BubbleVariant
  ) => void;
}

const NotificationBubbleContext = createContext<NotificationBubbleContextValue>(
  {
    showBubble: () => {},
  }
);

// eslint-disable-next-line react-refresh/only-export-components
export function useNotificationBubble() {
  return use(NotificationBubbleContext);
}

const VARIANT_CONFIG: Record<
  BubbleVariant,
  { icon: typeof Trophy; color: string; bg: string; border: string }
> = {
  /* PR gold is THEME.tier.gold — byte-identical to the #ffd700 that
     was here, and the same gold the badge/medal tiers already use. */
  pr: {
    icon: Trophy,
    color: THEME.tier.gold,
    bg: `${THEME.tier.gold}14`,
    border: `${THEME.tier.gold}26`,
  },
  /* Was teal-500 (#14b8a6) — stock Tailwind, not a Tropos colour, and
     not the hydration teal it reads as. A CheckCircle "complete" is the
     POSITIVE register, so it takes THEME.success. */
  complete: {
    icon: CheckCircle,
    color: THEME.success,
    bg: `${THEME.success}14`,
    border: `${THEME.success}26`,
  },
  generic: {
    icon: Bell,
    color: THEME.brand,
    bg: `${THEME.brand}12`,
    border: `${THEME.brand}1F`,
  },
};

export function NotificationBubbleProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [bubble, setBubble] = useState<BubbleData | null>(null);
  const [progress, setProgress] = useState(1);

  const showBubble = useCallback(
    (title: string, subtitle?: string, variant: BubbleVariant = "generic") => {
      setBubble({ id: Date.now(), title, subtitle, variant });
      setProgress(1);
    },
    []
  );

  useEffect(() => {
    if (!bubble) return;
    const start = Date.now();
    const duration = 4000;
    let rafId: number;
    let cancelled = false;
    const frame = () => {
      if (cancelled) return;
      const elapsed = Date.now() - start;
      const remaining = Math.max(0, 1 - elapsed / duration);
      setProgress(remaining);
      if (remaining > 0) rafId = requestAnimationFrame(frame);
      else setBubble(null);
    };
    rafId = requestAnimationFrame(frame);
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, [bubble]);

  const config = bubble
    ? VARIANT_CONFIG[bubble.variant]
    : VARIANT_CONFIG.generic;
  const Icon = config.icon;

  const value = useMemo(() => ({ showBubble }), [showBubble]);

  return (
    <NotificationBubbleContext.Provider value={value}>
      {children}
      <AnimatePresence>
        {bubble && (
          <motion.div
            key={bubble.id}
            initial={{ y: -80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -80, opacity: 0 }}
            drag="y"
            dragConstraints={{ top: -100, bottom: 0 }}
            onDragEnd={(_, info) => {
              if (info.offset.y < -30) setBubble(null);
            }}
            transition={{ type: "spring", damping: 20, stiffness: 300 }}
            className="fixed top-3 left-4 right-4 z-[70] cursor-grab active:cursor-grabbing"
          >
            <div
              className="rounded-2xl px-4 py-3 flex items-center gap-3 shadow-lg relative overflow-hidden"
              style={{
                background: "var(--glass-bg)",
                border: `1px solid ${config.border}`,
              }}
            >
              {/* Progress bar */}
              <div
                className="absolute bottom-0 left-0 h-0.5 transition-none"
                style={{
                  width: `${progress * 100}%`,
                  backgroundColor: config.color,
                  opacity: 0.6,
                }}
              />

              <div
                className="size-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: config.bg }}
              >
                <Icon className="size-5" style={{ color: config.color }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">
                  {bubble.title}
                </p>
                {bubble.subtitle && (
                  <p className="text-xs text-muted-foreground truncate">
                    {bubble.subtitle}
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </NotificationBubbleContext.Provider>
  );
}
