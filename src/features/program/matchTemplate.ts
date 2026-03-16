import type { UserProfile } from "@/lib/auth";
import type { ProgramTemplate } from "./templates";

export function matchTemplate(
  profile: UserProfile,
  templates: ProgramTemplate[],
): ProgramTemplate {
  const days = profile.daysPerWeek || 4;
  const equip = profile.equipment || "full_gym";
  const gender = profile.gender || "unspecified";
  const split = profile.preferredSplit || "auto";
  const goal = profile.primaryGoal === "running" ? "general" : (profile.primaryGoal || "general");
  const exp = profile.experience || "intermediate";
  const runFreq = profile.runFrequency || "none";

  const scored = templates.map(function (t) {
    let score = 0;

    // Hard filters
    if (t.daysPerWeek !== days) return { template: t, score: -1 };
    if (t.equipment !== equip) return { template: t, score: -1 };

    // Split preference
    if (split !== "auto" && t.split === split) score += 10;

    // Goal match
    if (t.goal === goal) score += 10;

    // Experience match
    if (t.experience.includes(exp)) score += 5;

    // Gender match
    if (t.gender.includes(gender) || t.gender.includes("unspecified")) score += 3;

    // Run integration
    if (runFreq === "regular" && t.runIntegration) score += 5;
    if (runFreq === "none" && !t.runIntegration) score += 2;

    return { template: t, score };
  });

  const valid = scored
    .filter(function (s) { return s.score >= 0; })
    .sort(function (a, b) { return b.score - a.score; });

  if (valid.length > 0) return valid[0].template;

  // Fallback: first full_body template or first template
  return templates.find(function (t) { return t.split === "full_body"; }) || templates[0];
}

export function applyInjuryFilters(
  template: ProgramTemplate,
  injuries: string[],
): ProgramTemplate {
  if (!injuries.length || injuries.includes("none")) return template;

  const filtered = structuredClone(template);

  for (const week of filtered.weeks) {
    for (const day of week.days) {
      day.exercises = day.exercises.map(function (ex) {
        const isContraindicated = ex.contraindicated?.some(function (c) {
          return injuries.includes(c);
        });
        if (isContraindicated && ex.alternatives?.length) {
          return {
            ...ex,
            name: ex.alternatives[0],
            exerciseId: ex.alternatives[0].toLowerCase().replace(/\s+/g, "-"),
            notes: "Swapped from " + ex.name + " (" + injuries.join(", ") + " limitation)",
          };
        }
        return ex;
      });
    }
  }

  return filtered;
}
