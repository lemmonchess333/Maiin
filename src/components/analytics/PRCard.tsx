interface PR {
  label: string;
  value: string;
  date: string;
  isNew?: boolean;
}

interface PRCardProps {
  title: string;
  prs: PR[];
  accentColor?: string;
}

export default function PRCard({ title, prs, accentColor = '#FFB547' }: PRCardProps) {
  if (prs.length === 0) return null;

  return (
    <div className="p-4 rounded-2xl bg-card border border-border/50">
      <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
        {title}
      </h3>
      <div className="space-y-2">
        {prs.map((pr) => (
          <div key={pr.label} className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0">
            <div className="flex items-center gap-2">
              {pr.isNew && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold"
                  style={{ background: `${accentColor}20`, color: accentColor }}>
                  NEW
                </span>
              )}
              <span className="text-xs text-muted-foreground">{pr.label}</span>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold font-mono tabular-nums text-foreground">{pr.value}</p>
              <p className="text-[9px] text-muted-foreground/50">{pr.date}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
