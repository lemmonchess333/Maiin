import { useRef } from "react";
import { Upload } from "lucide-react";
import { parseGpx, parseGpxName } from "@/lib/gpx";
import type { GPSPoint } from "@/lib/gps";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/Button";

interface GpxImportButtonProps {
  /** Called with the parsed route + its GPX name (null if unnamed). */
  onRoute: (points: GPSPoint[], name: string | null) => void;
  className?: string;
}

/**
 * Imports a .gpx file and hands the parsed polyline up via onRoute — the GPX
 * source for follow-a-route (sibling to "Re-run this route"). Import-and-go: no
 * persistence, the route is followed for this run only. Resets the input after
 * each pick so re-selecting the same file fires onChange again.
 */
export default function GpxImportButton({
  onRoute,
  className,
}: GpxImportButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const points = parseGpx(text);
      if (points.length < 2) {
        toast.error("Couldn't read a route from that file");
        return;
      }
      onRoute(points, parseGpxName(text));
    } catch {
      toast.error("Couldn't read that file");
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".gpx,application/gpx+xml,application/xml,text/xml"
        className="hidden"
        onChange={handleFile}
      />
      <Button
        variant="sport-tinted"
        className={className}
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="size-4" aria-hidden="true" />
        Follow a route
      </Button>
    </>
  );
}
