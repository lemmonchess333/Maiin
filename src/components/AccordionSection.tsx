import { useEffect, useRef, useState, useId } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { haptic } from "@/lib/haptic";

interface AccordionSectionProps {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  /** Set1.2 — when true, skip the collapsible accordion shell and
   *  render the body directly. Used by the nested-page Settings
   *  IA where the user has already drilled into a single section,
   *  so the toggle adds noise without value. The legacy stacked
   *  Settings page still uses accordion mode (default). */
  inline?: boolean;
  /** Optional callback fired the first time this accordion opens.
   *  Used by the Settings page to emit `settings_section_viewed` —
   *  on a settings page, "viewed" means "user expanded to see the
   *  body", since closed accordion bodies don't render. Fires at
   *  most once per mount; subsequent toggles don't re-fire. */
  onFirstOpen?: () => void;
  children: React.ReactNode;
}

export default function AccordionSection({
  icon,
  title,
  subtitle,
  defaultOpen = false,
  inline = false,
  onFirstOpen,
  children,
}: AccordionSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  const triggerId = `${id}-trigger`;
  const panelId = `${id}-panel`;
  // Guard so onFirstOpen fires exactly once per mount even when the
  // user toggles the accordion open/close/open. Telemetry is a "first
  // view" signal; re-opens aren't separate "views". The callback is
  // captured in a ref so its identity changing per-render doesn't
  // re-fire the effect.
  const firedRef = useRef(false);
  const onFirstOpenRef = useRef(onFirstOpen);
  useEffect(() => {
    onFirstOpenRef.current = onFirstOpen;
  }, [onFirstOpen]);
  // If the accordion defaults open, count the initial mount as the
  // first view.
  useEffect(() => {
    if (defaultOpen && !firedRef.current) {
      firedRef.current = true;
      onFirstOpenRef.current?.();
    }
    // Mount-only — defaultOpen is read once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleToggle = () => {
    haptic("light");
    const next = !open;
    if (next && !firedRef.current) {
      firedRef.current = true;
      onFirstOpenRef.current?.();
    }
    setOpen(next);
  };

  // Inline mode — no accordion chrome. The parent (SettingsSection on
  // nested pages) already provides title/back chrome, so we skip the
  // icon+title button and just render the body. Preserves the
  // `space-y-4` rhythm via the wrapping div.
  if (inline) {
    return <div className="space-y-4">{children}</div>;
  }

  return (
    <div className="bg-card rounded-2xl overflow-hidden">
      <button
        id={triggerId}
        onClick={handleToggle}
        className="w-full flex items-center justify-between p-4"
        aria-expanded={open}
        aria-controls={panelId}
      >
        <div className="flex items-center gap-3">
          {icon}
          <div className="text-left">
            <p className="text-sm font-medium text-foreground">{title}</p>
            {subtitle && (
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>
        </div>
        {open ? (
          <ChevronUp className="size-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="size-4 text-muted-foreground" />
        )}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            id={panelId}
            role="region"
            aria-labelledby={triggerId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-4 border-t border-border/50 pt-4">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
