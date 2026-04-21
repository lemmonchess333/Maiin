/**
 * Curated list of popular running shoes — powers the typeahead in the
 * "My Shoes" settings card so users can tap a known model instead of
 * typing. Intentionally not exhaustive: covers the eight dominant run
 * brands with their current flagship daily trainers, max-cushion, race
 * shoes, and stability picks. New releases get added as they appear.
 *
 * `recommendedMaxKm` is the typical retirement distance for that model
 * class — racers (carbon plates, PEBA foams) degrade fastest (~250 km),
 * max-cushion daily trainers go longest (~800 km). Used as the default
 * value when a user picks a known model.
 */
export interface ShoeModel {
  name: string;
  brand: string;
  recommendedMaxKm: number;
}

export const SHOE_DATABASE: readonly ShoeModel[] = [
  // Nike — flagship daily, max, race, stability
  { name: "Pegasus 41", brand: "Nike", recommendedMaxKm: 650 },
  { name: "Pegasus Plus", brand: "Nike", recommendedMaxKm: 500 },
  { name: "Vaporfly 3", brand: "Nike", recommendedMaxKm: 250 },
  { name: "Alphafly 3", brand: "Nike", recommendedMaxKm: 250 },
  { name: "Invincible 3", brand: "Nike", recommendedMaxKm: 800 },
  { name: "Structure 25", brand: "Nike", recommendedMaxKm: 650 },
  { name: "Vomero 17", brand: "Nike", recommendedMaxKm: 700 },
  { name: "Zoom Fly 5", brand: "Nike", recommendedMaxKm: 500 },

  // Adidas
  { name: "Ultraboost 5", brand: "Adidas", recommendedMaxKm: 700 },
  { name: "Adizero Boston 12", brand: "Adidas", recommendedMaxKm: 500 },
  { name: "Adizero Adios Pro 3", brand: "Adidas", recommendedMaxKm: 250 },
  { name: "Adizero Takumi Sen 10", brand: "Adidas", recommendedMaxKm: 250 },
  { name: "Supernova Rise", brand: "Adidas", recommendedMaxKm: 650 },

  // Asics
  { name: "Gel-Nimbus 26", brand: "Asics", recommendedMaxKm: 800 },
  { name: "Gel-Kayano 31", brand: "Asics", recommendedMaxKm: 800 },
  { name: "Novablast 4", brand: "Asics", recommendedMaxKm: 650 },
  { name: "Gel-Cumulus 26", brand: "Asics", recommendedMaxKm: 700 },
  { name: "Superblast", brand: "Asics", recommendedMaxKm: 500 },
  { name: "Metaspeed Sky Paris", brand: "Asics", recommendedMaxKm: 250 },

  // Hoka
  { name: "Clifton 9", brand: "Hoka", recommendedMaxKm: 650 },
  { name: "Bondi 8", brand: "Hoka", recommendedMaxKm: 800 },
  { name: "Mach 6", brand: "Hoka", recommendedMaxKm: 500 },
  { name: "Cielo X1", brand: "Hoka", recommendedMaxKm: 250 },
  { name: "Rocket X 2", brand: "Hoka", recommendedMaxKm: 250 },
  { name: "Arahi 7", brand: "Hoka", recommendedMaxKm: 650 },
  { name: "Speedgoat 6", brand: "Hoka", recommendedMaxKm: 700 },

  // Saucony
  { name: "Endorphin Speed 4", brand: "Saucony", recommendedMaxKm: 500 },
  { name: "Endorphin Pro 4", brand: "Saucony", recommendedMaxKm: 300 },
  { name: "Triumph 22", brand: "Saucony", recommendedMaxKm: 800 },
  { name: "Kinvara 15", brand: "Saucony", recommendedMaxKm: 500 },
  { name: "Ride 17", brand: "Saucony", recommendedMaxKm: 700 },

  // New Balance
  { name: "Fresh Foam More v5", brand: "New Balance", recommendedMaxKm: 800 },
  { name: "FuelCell SC Elite v4", brand: "New Balance", recommendedMaxKm: 250 },
  { name: "Fresh Foam 1080 v14", brand: "New Balance", recommendedMaxKm: 700 },
  { name: "FuelCell Rebel v4", brand: "New Balance", recommendedMaxKm: 500 },
  { name: "FuelCell SuperComp Trainer v3", brand: "New Balance", recommendedMaxKm: 500 },

  // On
  { name: "Cloudmonster", brand: "On", recommendedMaxKm: 700 },
  { name: "Cloudboom Echo 3", brand: "On", recommendedMaxKm: 250 },
  { name: "Cloudflow 4", brand: "On", recommendedMaxKm: 600 },
  { name: "Cloudsurfer 7", brand: "On", recommendedMaxKm: 650 },

  // Brooks
  { name: "Ghost 16", brand: "Brooks", recommendedMaxKm: 700 },
  { name: "Glycerin 21", brand: "Brooks", recommendedMaxKm: 800 },
  { name: "Hyperion Max 2", brand: "Brooks", recommendedMaxKm: 500 },
  { name: "Hyperion Elite 4", brand: "Brooks", recommendedMaxKm: 300 },
  { name: "Adrenaline GTS 24", brand: "Brooks", recommendedMaxKm: 650 },

  // Puma / Mizuno
  { name: "Deviate Nitro Elite 3", brand: "Puma", recommendedMaxKm: 250 },
  { name: "Velocity Nitro 3", brand: "Puma", recommendedMaxKm: 600 },
  { name: "Wave Rider 28", brand: "Mizuno", recommendedMaxKm: 700 },
  { name: "Wave Rebellion Pro 2", brand: "Mizuno", recommendedMaxKm: 300 },
];

/**
 * Fuzzy-match shoes against a search string. Case-insensitive substring
 * match on both name and brand, capped to keep the suggestion panel
 * comfortable on small screens.
 */
export function searchShoes(query: string, maxResults = 6): ShoeModel[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [];
  const matches: ShoeModel[] = [];
  for (const shoe of SHOE_DATABASE) {
    if (
      shoe.name.toLowerCase().includes(trimmed) ||
      shoe.brand.toLowerCase().includes(trimmed)
    ) {
      matches.push(shoe);
      if (matches.length >= maxResults) break;
    }
  }
  return matches;
}
