import { THEME } from '../../lib/theme';

export default function PaceLegend() {
  return (
    <div className="flex items-center justify-center gap-5 py-2">
      <div className="flex items-center gap-1.5">
        <div className="w-4 h-1.5 rounded-full" style={{ background: THEME.paceFast }} />
        <span className="text-[11px] text-muted-foreground">Faster</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-4 h-1.5 rounded-full" style={{ background: THEME.paceOnTarget }} />
        <span className="text-[11px] text-muted-foreground">On pace</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-4 h-1.5 rounded-full" style={{ background: THEME.paceSlow }} />
        <span className="text-[11px] text-muted-foreground">Slower</span>
      </div>
    </div>
  );
}
