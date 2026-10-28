/** Exercise art held from the player pending a reviewed replacement. */
export const FORM_ART_QUARANTINE_IDS = new Set<string>();

export const isFormArtQuarantined = (id: string): boolean =>
  FORM_ART_QUARANTINE_IDS.has(id);
