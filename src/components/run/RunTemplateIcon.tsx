import { Footprints, type LucideProps } from "lucide-react";
import { RUN_TEMPLATE_ICONS } from "./runTemplateIcons";

/**
 * A run template's glyph, drawn: the same table and the same footprints
 * fallback as `runTemplateIcon`, for a card that renders the glyph itself
 * rather than handing it to another component.
 *
 * The lookup is written out here, as a read of the table, instead of
 * calling `runTemplateIcon`. A component that comes back from a call in
 * render is one React's lint cannot prove stable, so it fails the build
 * (react-hooks/static-components) even though this one always is.
 */
export default function RunTemplateIcon({
  icon,
  ...props
}: { icon?: string | null } & LucideProps) {
  const Glyph = (icon && RUN_TEMPLATE_ICONS[icon]) || Footprints;
  return <Glyph {...props} />;
}
