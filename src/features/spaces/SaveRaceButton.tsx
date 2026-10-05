import { Bookmark } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";
import { haptic } from "@/lib/haptic";
import type { useSavedRaces } from "./useSavedRaces";

export default function SaveRaceButton({
  id,
  name,
  saved,
}: {
  id: string;
  name: string;
  saved: ReturnType<typeof useSavedRaces>;
}) {
  const selected = saved.ids.has(id);
  return (
    <IconButton
      aria-label={selected ? `Remove ${name} from saved races` : `Save ${name}`}
      aria-pressed={selected}
      variant={selected ? "sport-tinted" : "secondary"}
      icon={<Bookmark fill={selected ? "currentColor" : "none"} />}
      loading={saved.pendingIds.has(id)}
      disabled={!saved.ready || !saved.isOnline}
      onClick={() => {
        haptic("light");
        void saved.toggle(id);
      }}
    />
  );
}
