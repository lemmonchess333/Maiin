/**
 * The app's side of the Home Screen and Lock Screen widgets (Wid1): writes
 * the snapshot they draw, and reads the drinks the food widget's "+"
 * queued. `ios/App/App/HomeWidgetsPlugin.swift` is the other side; it
 * keeps both in the App Group the widget extension shares
 * (`homeWidgetContract.ts`) and asks WidgetKit to redraw, throttled.
 *
 * Inert on the web, where there are no widgets, and on an older iPhone
 * build without the plugin: every call resolves, and says whether it
 * reached native. Nothing here may stop the app, as a Watch transport
 * failure may not stop a run (`watchRunBridge.ts`).
 */
import { registerPlugin } from "@capacitor/core";
import { isNativePlatform } from "./platform";
import {
  DRINK_KEYS,
  SECTION_KEYS,
  type HomeWidgetSections,
  type HomeWidgetSnapshot,
  type WidgetDrink,
} from "./homeWidgetContract";

interface HomeWidgetsPlugin {
  /** Keeps the snapshot, JSON, and redraws the widgets. */
  writeSnapshot(options: { snapshot: string }): Promise<void>;
  /** Merges the sections named, JSON, into the snapshot kept for their
   *  account (a bare one when there is none), and redraws. */
  writeSections(options: { sections: string }): Promise<void>;
  /** Forgets it, on sign-out: the widgets draw their first-use state. */
  clearSnapshot(): Promise<void>;
  /** The drinks the widget queued, oldest first. */
  getQueuedDrinks(): Promise<{ drinks: unknown[] }>;
  /** Forgets these drinks, and only these: one queued since the read
   *  stays. */
  removeQueuedDrinks(options: { ids: string[] }): Promise<void>;
}

let plugin: HomeWidgetsPlugin | null = null;
function nativePlugin(): HomeWidgetsPlugin | null {
  if (!isNativePlatform()) return null;
  plugin ??= registerPlugin<HomeWidgetsPlugin>("HomeWidgets");
  return plugin;
}

/** A snapshot whose content has not changed is written again only after
 *  this long, to keep its time fresh: the widget dims a day-old one
 *  (W8d), and a rewrite costs a redraw. */
export const SNAPSHOT_REWRITE_MS = 15 * 60 * 1000;

let lastWritten: { content: string; writtenAt: number } | null = null;

type SectionKey = (typeof SECTION_KEYS)[number];
/** Each section as last written, by itself or in a whole snapshot, and
 *  when: the same figures go again only to refresh their time. */
const lastSections = new Map<
  SectionKey,
  { account: string; content: string; at: number }
>();

/** A section's figures without its time, to tell new figures apart. */
function sectionContent(value: { updatedAt?: number } | null | undefined) {
  if (!value) return "null";
  const { updatedAt: _at, ...figures } = value;
  return JSON.stringify(figures);
}

function rememberSections(
  account: string,
  sections: Partial<Record<SectionKey, { updatedAt?: number } | null>>,
  at: number
) {
  for (const key of SECTION_KEYS)
    if (key in sections)
      lastSections.set(key, {
        account,
        content: sectionContent(sections[key]),
        at,
      });
}

/** Writes the snapshot, unless the same content went less than
 *  `SNAPSHOT_REWRITE_MS` ago. Whether the widgets have it now. */
export async function writeHomeWidgetSnapshot(
  snapshot: HomeWidgetSnapshot
): Promise<boolean> {
  const native = nativePlugin();
  if (!native) return false;
  const { writtenAt, ...rest } = snapshot;
  const content = JSON.stringify(rest);
  if (
    lastWritten &&
    lastWritten.content === content &&
    writtenAt - lastWritten.writtenAt < SNAPSHOT_REWRITE_MS
  )
    return true;
  try {
    await native.writeSnapshot({ snapshot: JSON.stringify(snapshot) });
    lastWritten = { content, writtenAt };
    rememberSections(snapshot.account, snapshot, writtenAt);
    return true;
  } catch {
    return false;
  }
}

/**
 * Writes the food or water section on its own, from a screen other than
 * Home: Food after a meal is logged, edited or deleted, and the water
 * writer above the routes after any drink. The plugin merges it into the
 * stored snapshot, under the same throttled redraw. Figures already
 * written, by a section write or Home's whole snapshot, go again only
 * after `SNAPSHOT_REWRITE_MS`, to refresh their time. Whether the widgets
 * have them now.
 */
export async function writeHomeWidgetSections(
  sections: HomeWidgetSections,
  nowMs: number = Date.now()
): Promise<boolean> {
  const native = nativePlugin();
  if (!native) return false;
  const changed = SECTION_KEYS.filter((key) => {
    if (!(key in sections)) return false;
    const last = lastSections.get(key);
    return !(
      last &&
      last.account === sections.account &&
      last.content === sectionContent(sections[key]) &&
      nowMs - last.at < SNAPSHOT_REWRITE_MS
    );
  });
  if (changed.length === 0) return true;
  const write: HomeWidgetSections = {
    account: sections.account,
    ...(changed.includes("food") ? { food: sections.food ?? null } : {}),
    ...(changed.includes("water") ? { water: sections.water ?? null } : {}),
  };
  try {
    await native.writeSections({ sections: JSON.stringify(write) });
    rememberSections(sections.account, write, nowMs);
    return true;
  } catch {
    return false;
  }
}

/** Takes the snapshot off this phone's widgets, on sign-out, so the next
 *  account's lock screen never shows the last one's day. Never throws. */
export async function clearHomeWidgets(): Promise<void> {
  lastWritten = null;
  lastSections.clear();
  const native = nativePlugin();
  if (!native) return;
  try {
    await native.clearSnapshot();
  } catch {
    // An older build has no widgets to clear.
  }
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A queued drink as the widget wrote it, or null for anything else: the
 *  App Group is input like any other. */
export function widgetDrinkOf(value: unknown): WidgetDrink | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  if (
    typeof v.id !== "string" ||
    !/^[0-9A-Fa-f-]{8,64}$/.test(v.id) ||
    typeof v.account !== "string" ||
    typeof v.date !== "string" ||
    !DAY.test(v.date) ||
    typeof v.ml !== "number" ||
    !Number.isFinite(v.ml) ||
    typeof v.at !== "number" ||
    !Number.isFinite(v.at)
  )
    return null;
  return Object.fromEntries(
    DRINK_KEYS.map((key) => [key, v[key]])
  ) as unknown as WidgetDrink;
}

/** What the widget queued: the drinks it wrote, and the ids of entries
 *  that are not drinks, to be cleared with them. Empty off the phone. */
export async function readWidgetDrinks(): Promise<{
  drinks: WidgetDrink[];
  unreadable: string[];
}> {
  const native = nativePlugin();
  if (!native) return { drinks: [], unreadable: [] };
  try {
    const { drinks } = await native.getQueuedDrinks();
    const read: WidgetDrink[] = [];
    const unreadable: string[] = [];
    for (const entry of Array.isArray(drinks) ? drinks : []) {
      const drink = widgetDrinkOf(entry);
      if (drink) read.push(drink);
      else {
        const id = (entry as { id?: unknown } | null)?.id;
        if (typeof id === "string" && id) unreadable.push(id);
      }
    }
    return { drinks: read, unreadable };
  } catch {
    return { drinks: [], unreadable: [] };
  }
}

/** Forgets the drinks named. Whether native has. */
export async function removeWidgetDrinks(ids: string[]): Promise<boolean> {
  const native = nativePlugin();
  if (!native || ids.length === 0) return false;
  try {
    await native.removeQueuedDrinks({ ids });
    return true;
  } catch {
    return false;
  }
}

export function __resetHomeWidgetsForTests(): void {
  plugin = null;
  lastWritten = null;
  lastSections.clear();
}
