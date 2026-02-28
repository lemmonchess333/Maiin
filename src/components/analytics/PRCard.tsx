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
    <div className="p-4 rounded-2xl bg-[#1C1C24] border border-white/5">
      <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">🏆 {title}</h3>
      <div className="space-y-2">
        {prs.map((pr) => (
          <div key={pr.label} className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0">
            <div className="flex items-center gap-2">
              {pr.isNew && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: `${accentColor}20`, color: accentColor }}>
                  NEW
                </span>
              )}
              <span className="text-xs text-white/50">{pr.label}</span>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold font-mono tabular-nums text-white">{pr.value}</p>
              <p className="text-[9px] text-white/20">{pr.date}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
