import { Footprints } from "lucide-react";
import AccordionSection from "@/components/AccordionSection";
import ShoesManager from "@/components/settings/ShoesManager";

export default function ShoesSection() {
  return (
    <AccordionSection icon={<Footprints className="w-5 h-5 text-primary" />} title="My Shoes" subtitle="Track mileage, get replacement alerts">
      <ShoesManager />
    </AccordionSection>
  );
}
