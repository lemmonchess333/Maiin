import { Trophy } from "lucide-react";
import { THEME } from "@/lib/theme";

interface PR {
  label: string;
  value: string;
  date: string;
  isNew?: boolean;
}

interface PRCardProps {
  title: string;
  /* Optional muted subtitle rendered under the title. Used by the
     Running PRs card to disclose "Outdoor GPS only" so treadmill /
     manual users understand why their PRs may be empty without
     having to re-label every PR row. */
  subtitle?: string;
  prs: PR[];
  accentColor?: string;
  icon?: string;
}

export default function PRCard({
  title,
  subtitle,
  prs,
  accentColor = THEME.tier.gold,
}: PRCardProps) {
  if (prs.length === 0) return null;

  return (
    <div
      className="rounded-xl bg-card overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${accentColor}08 0%, transparent 60%)`,
      }}
    >
      <div className="px-4 pt-4 pb-3 flex items-center gap-2 border-b border-border/30">
        <Trophy className="size-4 text-amber-500" />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {subtitle && (
            <p className="text-caption text-muted-foreground mt-0.5">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      <div className="divide-y divide-border/20">
        {prs.map((pr) => (
          <div
            key={pr.label}
            className="flex items-center justify-between px-4 py-3"
          >
            <div className="flex items-center gap-2 min-w-0">
              {pr.isNew && (
                <span
                  className="text-xs px-1.5 py-0.5 rounded-full font-bold tracking-wider flex-shrink-0"
                  style={{ background: "var(--ds-orange-500)", color: "#fff" }}
                >
                  NEW
                </span>
              )}
              <span className="text-xs text-muted-foreground truncate">
                {pr.label}
              </span>
            </div>
            <div className="text-right flex-shrink-0 ml-3">
              <p className="text-sm font-bold font-mono tabular-nums text-foreground">
                {pr.value}
              </p>
              <p className="text-xs text-muted-foreground/50 mt-0.5">
                {pr.date}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
