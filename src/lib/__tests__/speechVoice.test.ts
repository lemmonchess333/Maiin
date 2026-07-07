/**
 * Coach-voice ranking (the "fix voices" pass). Pins the per-platform
 * winners: enhanced Siri-class voices on iOS beat their compact defaults,
 * Google network voices win on Chrome, neural voices on Edge, and the old
 * failure mode (no Google voice on iOS → first robotic en-GB) is dead.
 */
import { describe, it, expect } from "vitest";
import { pickCoachVoice, scoreVoice } from "../speechVoice";

describe("pickCoachVoice", () => {
  it("iOS: the enhanced voice beats the compact default of the same locale", () => {
    // Typical WKWebView list — no Google voices anywhere.
    const voices = [
      { name: "Daniel (Compact)", lang: "en-GB" },
      { name: "Samantha (Enhanced)", lang: "en-US" },
      { name: "Daniel", lang: "en-GB" },
      { name: "Kyoko", lang: "ja-JP" },
    ];
    expect(pickCoachVoice(voices)!.name).toBe("Samantha (Enhanced)");
  });

  it("iOS: an en-GB enhanced voice outranks an en-US enhanced one", () => {
    const voices = [
      { name: "Samantha (Enhanced)", lang: "en-US" },
      { name: "Serena (Premium)", lang: "en-GB" },
    ];
    expect(pickCoachVoice(voices)!.name).toBe("Serena (Premium)");
  });

  it("Chrome: Google UK English wins over generic locals", () => {
    const voices = [
      { name: "English United Kingdom", lang: "en-GB" },
      { name: "Google UK English Female", lang: "en-GB" },
      { name: "Google US English", lang: "en-US" },
    ];
    expect(pickCoachVoice(voices)!.name).toBe("Google UK English Female");
  });

  it("Edge: the Online (Natural) neural voice wins", () => {
    const voices = [
      { name: "Microsoft Hazel - English (United Kingdom)", lang: "en-GB" },
      {
        name: "Microsoft Sonia Online (Natural) - English (United Kingdom)",
        lang: "en-GB",
      },
    ];
    expect(pickCoachVoice(voices)!.name).toContain("Online (Natural)");
  });

  it("non-English voices are never picked; empty list → null", () => {
    expect(pickCoachVoice([{ name: "Kyoko", lang: "ja-JP" }])).toBeNull();
    expect(pickCoachVoice([])).toBeNull();
    expect(scoreVoice({ name: "Kyoko", lang: "ja-JP" })).toBe(-1);
  });

  it("a lone plain en voice still wins over nothing (engine fallback only when zero English)", () => {
    const voices = [
      { name: "Anna", lang: "de-DE" },
      { name: "Fred", lang: "en-US" },
    ];
    expect(pickCoachVoice(voices)!.name).toBe("Fred");
  });
});
