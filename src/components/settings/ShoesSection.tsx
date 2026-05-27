import { Footprints } from "lucide-react";
import AccordionSection from "@/components/AccordionSection";
import ShoesManager from "@/components/settings/ShoesManager";

interface ShoesSectionProps {
  inline?: boolean;
}

export default function ShoesSection({
  inline = false,
}: ShoesSectionProps = {}) {
  return (
    <AccordionSection
      inline={inline}
      icon={<Footprints className="size-5 text-primary" />}
      title="My Shoes"
      subtitle="Track mileage, get replacement alerts"
    >
      <ShoesManager />
    </AccordionSection>
  );
}
