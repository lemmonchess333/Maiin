/* ─────────────────────────────────────────────
Performance Engine — Server-side (Cloud Functions)
Port of src/lib/performanceEngine.ts to plain JS
with Firestore data fetching added on top.
───────────────────────────────────────────── */

const admin = require(“firebase-admin”);

const db = admin.firestore();

// ── Constants ────────────────────────────────

const PI_WEIGHTS = {
load: 0.65,
recovery: 0.25,
adherence: 0.10,
liftInLoad: 0.5,
runInLoad: 0.5,
};

const BASELINE_WEEKS = 4;
const COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes

// ── Week-key helpers ─────────────────────────

function getWeekKey(date) {
const d = new Date(date);
d.setDate(d.getDate() - d.getDay());
return d.toISOString().split(“T”)[0];
}

function weekKeyMinusN(weekKey, n) {
const d = new Date(weekKey + “T00:00:00Z”);
d.setDate(d.getDate() - 7 * n);
return d.toISOString().split(“T”)[0];
}

/** Start and end Dates for a given weekKey (Sunday 00:00 → next Sunday 00:00) */
function weekRange(weekKey) {
const start = new Date(weekKey + “T00:00:00Z”);
const end = new Date(start);
end.setDate(end.getDate() + 7);
return { start, end };
}

function clamp(v) {
return Math.max(0, Math.min(100, Math.round(v)));
}

function safeRatio(current, baseline) {
if (baseline <= 0) return current > 0 ? 1.2 : 0;
return current / baseline;
}

// ── Firestore data fetching ──────────────────

/**

- Fetch all raw data for a user across a date window.
- Returns { workouts, runs, meals, bodyweightLogs } as arrays.
  */
  async function fetchWindowData(uid, windowStart, windowEnd) {
  const userRef = db.collection(“users”).doc(uid);
  const startTs = admin.firestore.Timestamp.fromDate(windowStart);
  const endTs = admin.firestore.Timestamp.fromDate(windowEnd);

// Workouts — date is a string “YYYY-MM-DD”
const workoutsSnap = await userRef
.collection(“workouts”)
.where(“date”, “>=”, windowStart.toISOString().split(“T”)[0])
.where(“date”, “<=”, windowEnd.toISOString().split(“T”)[0])
.get();
const workouts = workoutsSnap.docs.map((d) => ({ id: d.id, …d.data() }));

// Runs — completedAt is a Timestamp
const runsSnap = await userRef
.collection(“runs”)
.where(“completedAt”, “>=”, startTs)
.where(“completedAt”, “<=”, endTs)
.get();
const runs = runsSnap.docs.map((d) => ({ id: d.id, …d.data() }));

// Meals — date is a string “YYYY-MM-DD”
let meals = [];
try {
const mealsSnap = await userRef
.collection(“meals”)
.where(“date”, “>=”, windowStart.toISOString().split(“T”)[0])
.where(“date”, “<=”, windowEnd.toISOString().split(“T”)[0])
.get();
meals = mealsSnap.docs.map((d) => ({ id: d.id, …d.data() }));
} catch (_) {
// Collection may not exist — that’s fine
}

// Bodyweight logs — date is a string “YYYY-MM-DD”
let bodyweightLogs = [];
try {
const bwSnap = await userRef
.collection(“bodyweightLogs”)
.where(“date”, “>=”, windowStart.toISOString().split(“T”)[0])
.where(“date”, “<=”, windowEnd.toISOString().split(“T”)[0])
.get();
bodyweightLogs = bwSnap.docs.map((d) => ({ id: d.id, …d.data() }));
} catch (_) {
// Collection may not exist
}

return { workouts, runs, meals, bodyweightLogs };
}

// ── Aggregation ──────────────────────────────

function aggregateWeek(weekKey, workouts, runs, meals, bodyweightLogs) {
const { start, end } = weekRange(weekKey);

// ── Lifting ──
let liftTonnage = 0;
let liftHardSets = 0;
let liftSessions = 0;

workouts.forEach((w) => {
const d = new Date(w.date + “T00:00:00Z”);
if (d < start || d >= end) return;
liftSessions++;
(w.exercises || []).forEach((ex) => {
const isCardio = (ex.category || “”).toLowerCase() === “cardio”;
(ex.sets || []).forEach((set, idx) => {
liftTonnage += (set.weightKg || 0) * (set.reps || 0);
if (!isCardio && idx === (ex.sets || []).length - 1) {
liftHardSets++;
}
});
});
});

// ── Running ──
let runKm = 0;
let runLongKm = 0;
let runQualityCount = 0;
let runSessions = 0;

runs.forEach((r) => {
const d = r.completedAt && r.completedAt.toDate ? r.completedAt.toDate() : null;
if (!d || d < start || d >= end) return;
runSessions++;
const km = (r.distance || 0) / 1000;
runKm += km;
if (km > runLongKm) runLongKm = km;
// Quality = has intervalData or activityType is tempo/interval
const at = (r.activityType || “”).toLowerCase();
if (r.intervalData || at === “tempo” || at === “interval”) {
runQualityCount++;
}
});

// ── Meals ──
const mealDays = new Set();
let totalCal = 0;
let totalProt = 0;
meals.forEach((m) => {
const d = new Date((m.date || “”) + “T00:00:00Z”);
if (d < start || d >= end) return;
mealDays.add(m.date);
totalCal += m.totalCalories || 0;
totalProt += m.totalProtein || 0;
});
const mealDaysLogged = mealDays.size;

// ── Bodyweight ──
// Current week: last 7 days of the week; previous: 7 days before that
const bwThisWeek = [];
const bwPrevWeek = [];
const prevStart = new Date(start);
prevStart.setDate(prevStart.getDate() - 7);

bodyweightLogs.forEach((l) => {
const d = new Date((l.date || “”) + “T00:00:00Z”);
if (d >= start && d < end) bwThisWeek.push(l.weight);
else if (d >= prevStart && d < start) bwPrevWeek.push(l.weight);
});

const avg = (arr) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

return {
weekKey,
liftTonnage,
liftHardSets,
liftSessions,
runKm: Math.round(runKm * 10) / 10,
runLongKm: Math.round(runLongKm * 10) / 10,
runQualityCount,
runSessions,
mealDaysLogged,
avgDailyCalories: mealDaysLogged > 0 ? Math.round(totalCal / mealDaysLogged) : 0,
avgDailyProtein: mealDaysLogged > 0 ? Math.round(totalProt / mealDaysLogged) : 0,
bwCurrent7dAvg: avg(bwThisWeek),
bwPrevious7dAvg: avg(bwPrevWeek),
};
}

// ── Scoring (identical logic to performanceEngine.ts) ──

function computeBaseline(priorWeeks) {
const valid = priorWeeks.filter((w) => w.liftSessions > 0 || w.runSessions > 0);
const n = valid.length || 1;
return {
liftTonnage: valid.reduce((s, w) => s + w.liftTonnage, 0) / n,
liftHardSets: valid.reduce((s, w) => s + w.liftHardSets, 0) / n,
runKm: valid.reduce((s, w) => s + w.runKm, 0) / n,
runLongKm: valid.reduce((s, w) => s + w.runLongKm, 0) / n,
weeksUsed: valid.length,
};
}

function computeLiftLoadScore(agg, bl) {
if (agg.liftSessions === 0) return 0;
const tonnageRatio = safeRatio(agg.liftTonnage, bl.liftTonnage);
const hardSetRatio = safeRatio(agg.liftHardSets, bl.liftHardSets);
const raw = tonnageRatio * 0.7 + hardSetRatio * 0.3;
return clamp(raw * 67);
}

function computeRunLoadScore(agg, bl) {
if (agg.runSessions === 0) return 0;
const kmRatio = safeRatio(agg.runKm, bl.runKm);
const longRatio = safeRatio(agg.runLongKm, bl.runLongKm);
const qualityBonus = agg.runQualityCount > 0 ? 10 : 0;
const raw = kmRatio * 0.6 + longRatio * 0.4;
return clamp(raw * 67 + qualityBonus);
}

function computeRecoveryScore(agg) {
let score = 60;
if (agg.bwCurrent7dAvg != null && agg.bwPrevious7dAvg != null) {
const delta = Math.abs(agg.bwCurrent7dAvg - agg.bwPrevious7dAvg);
if (delta <= 0.5) score += 20;
else if (delta <= 1.0) score += 10;
else if (delta > 2.0) score -= 15;
}
if (agg.mealDaysLogged >= 5) score += 15;
else if (agg.mealDaysLogged >= 3) score += 8;
const totalSessions = agg.liftSessions + agg.runSessions;
if (totalSessions > 8) score -= 10;
else if (totalSessions >= 4 && totalSessions <= 6) score += 5;
return clamp(score);
}

function computeAdherenceScore(agg, targetWorkouts, targetCalories, targetProtein) {
let score = 0;
let factors = 0;
if (targetWorkouts > 0) {
const totalSessions = agg.liftSessions + agg.runSessions;
const ratio = Math.min(totalSessions / targetWorkouts, 1.2);
score += ratio * 100;
factors++;
}
if (targetCalories && agg.mealDaysLogged >= 3 && agg.avgDailyCalories > 0) {
const calRatio = agg.avgDailyCalories / targetCalories;
const calScore = calRatio >= 0.85 && calRatio <= 1.15
? 100
: Math.max(0, 100 - Math.abs(1 - calRatio) * 200);
score += calScore;
factors++;
}
if (targetProtein && agg.mealDaysLogged >= 3 && agg.avgDailyProtein > 0) {
const protRatio = agg.avgDailyProtein / targetProtein;
const protScore = protRatio >= 0.9 ? 100 : protRatio * 111;
score += protScore;
factors++;
}
return factors > 0 ? clamp(score / factors) : 50;
}

function computeConfidence(agg, bl) {
let signals = 0;
if (agg.liftSessions > 0) signals++;
if (agg.runSessions > 0) signals++;
if (agg.mealDaysLogged >= 3) signals++;
if (agg.bwCurrent7dAvg != null) signals++;
if (bl.weeksUsed >= 3) signals++;
if (signals >= 4) return “high”;
if (signals >= 2) return “medium”;
return “low”;
}

function computeLoadBand(pi) {
if (pi >= 85) return “overreach”;
if (pi >= 70) return “high”;
if (pi >= 45) return “moderate”;
if (pi >= 25) return “low”;
return “deload”;
}

function shouldRecommendDeload(currentPI, recoveryScore, adherenceScore, previousWeekPI) {
if (currentPI >= 80 && recoveryScore < 45) return true;
if (currentPI >= 75 && previousWeekPI != null && previousWeekPI >= 75) return true;
if (currentPI >= 70 && adherenceScore < 50) return true;
return false;
}

function generateInsight(doc) {
const { performanceIndex: pi, liftLoadScore: lls, runLoadScore: rls, recoveryScore: rs, adherenceScore: as_, deloadRecommended, liftProgression: lp, runVolume: rv } = doc;
let title;
if (pi >= 75) title = “Momentum: High”;
else if (pi >= 45) title = “Momentum: Stable”;
else title = “Momentum: Low”;
const bullets = [];
if (deloadRecommended) bullets.push(“Consider a deload week — sustained high load with limited recovery signals.”);
if (lls >= 70 && rls >= 70) bullets.push(“Both lifting and running loads are strong this week — solid hybrid output.”);
else if (lls >= 70 && rls < 40) bullets.push(“Lifting is on point but running volume is low. Add an easy run if schedule allows.”);
else if (rls >= 70 && lls < 40) bullets.push(“Running volume is great but lifting load dropped. Prioritise your next session.”);
if (rs < 50 && bullets.length < 3) bullets.push(“Recovery signals are low — check sleep, hydration, and nutrition consistency.”);
if (as_ < 50 && bullets.length < 3) bullets.push(“Adherence dipped — focus on showing up consistently over hitting PRs.”);
if (lp > 1.15 && bullets.length < 3) bullets.push(`Lifting tonnage is ${Math.round((lp - 1) * 100)}% above baseline — great progression.`);
if (rv > 1.2 && bullets.length < 3) bullets.push(`Running volume ${Math.round((rv - 1) * 100)}% above baseline — watch for overuse.`);
if (bullets.length === 0) {
if (pi >= 45) bullets.push(“Consistent week. Keep the rhythm going.”);
else bullets.push(“Light week — a good time to focus on mobility and recovery.”);
}
return { title, bullets: bullets.slice(0, 3) };
}

function generatePlanAdjustments(doc) {
const lift = [];
const run = [];
if (doc.deloadRecommended) {
lift.push(“Reduce working sets by 30–40% or drop accessory work.”);
run.push(“Cap runs at easy pace. Replace one session with active recovery.”);
return { lift, run };
}
if (doc.loadBand === “overreach”) {
lift.push(“Maintain intensity but consider reducing total volume 10–15%.”);
run.push(“Keep long run but drop one mid-week session if fatigued.”);
} else if (doc.loadBand === “low” || doc.loadBand === “deload”) {
if (doc.liftLoadScore < 30) lift.push(“Focus on progressive overload — small weight jumps or extra set.”);
if (doc.runLoadScore < 30) run.push(“Add one easy 20-min run to rebuild aerobic base.”);
}
return { lift, run };
}

// ── Main compute + write ─────────────────────

/**

- Core engine: compute performance for one user for one week and write to Firestore.
- @param {string} uid
- @param {string|null} weekKeyOverride — if null, uses current week
- @returns {{ ok, weekKey, performanceIndex, confidence, loadBand }}
  */
  async function computeAndWritePerformanceForUser(uid, weekKeyOverride) {
  const targetWeekKey = weekKeyOverride || getWeekKey(new Date());

// Window: target week + BASELINE_WEEKS prior + 1 extra week for bodyweight prev avg
const windowStartKey = weekKeyMinusN(targetWeekKey, BASELINE_WEEKS + 1);
const windowStart = new Date(windowStartKey + “T00:00:00Z”);
const { end: windowEnd } = weekRange(targetWeekKey);

// Fetch profile for targets
const profileSnap = await db.collection(“users”).doc(uid).get();
const profile = profileSnap.exists ? profileSnap.data() : {};

// Fetch all raw data in window
const { workouts, runs, meals, bodyweightLogs } = await fetchWindowData(uid, windowStart, windowEnd);

// Aggregate each week
const weekKeys = [];
for (let i = 0; i <= BASELINE_WEEKS; i++) {
weekKeys.push(weekKeyMinusN(targetWeekKey, i));
}

const aggregatesMap = {};
weekKeys.forEach((wk) => {
aggregatesMap[wk] = aggregateWeek(wk, workouts, runs, meals, bodyweightLogs);
});

const currentAgg = aggregatesMap[targetWeekKey];
const priorAggs = [];
for (let i = 1; i <= BASELINE_WEEKS; i++) {
const k = weekKeyMinusN(targetWeekKey, i);
if (aggregatesMap[k]) priorAggs.push(aggregatesMap[k]);
}

const bl = computeBaseline(priorAggs);

const liftLoadScore = computeLiftLoadScore(currentAgg, bl);
const runLoadScore = computeRunLoadScore(currentAgg, bl);
const recoveryScore = computeRecoveryScore(currentAgg);
const adherenceScore = computeAdherenceScore(
currentAgg,
profile.weeklyWorkoutsTarget || 4,
profile.targetCalories || null,
profile.targetProtein || null,
);

const loadScore = PI_WEIGHTS.liftInLoad * liftLoadScore + PI_WEIGHTS.runInLoad * runLoadScore;
const pi = clamp(
PI_WEIGHTS.load * loadScore +
PI_WEIGHTS.recovery * recoveryScore +
PI_WEIGHTS.adherence * adherenceScore,
);

const liftProgression = safeRatio(currentAgg.liftTonnage, bl.liftTonnage);
const runVolume = safeRatio(currentAgg.runKm, bl.runKm);
const confidence = computeConfidence(currentAgg, bl);
const loadBand = computeLoadBand(pi);

// Get previous week’s PI for deload logic
let previousWeekPI = null;
try {
const prevKey = weekKeyMinusN(targetWeekKey, 1);
const prevDoc = await db.collection(“users”).doc(uid).collection(“performance”).doc(prevKey).get();
if (prevDoc.exists) previousWeekPI = prevDoc.data().performanceIndex;
} catch (_) { /* no previous doc, that’s fine */ }

const deloadRecommended = shouldRecommendDeload(pi, recoveryScore, adherenceScore, previousWeekPI);

const partial = { performanceIndex: pi, liftLoadScore, runLoadScore, recoveryScore, adherenceScore, liftProgression, runVolume, loadBand, deloadRecommended };
const insight = generateInsight(partial);
const planAdjustments = generatePlanAdjustments(partial);

const perfDoc = {
weekKey: targetWeekKey,
computedAt: new Date().toISOString(),
performanceIndex: pi,
liftLoadScore,
runLoadScore,
recoveryScore,
adherenceScore,
liftProgression,
runVolume,
runPaceAdjustmentPct: 0,
confidence,
loadBand,
deloadRecommended,
insight,
planAdjustments,
aggregates: currentAgg,
baseline: bl,
updatedAt: admin.firestore.FieldValue.serverTimestamp(),
};

await db
.collection(“users”).doc(uid)
.collection(“performance”).doc(targetWeekKey)
.set(perfDoc, { merge: true });

return { ok: true, weekKey: targetWeekKey, performanceIndex: pi, confidence, loadBand };
}

// ── Cooldown lock ────────────────────────────

/**

- Check and acquire a cooldown lock. Returns true if compute should proceed.
- Simple timestamp check — no transactions needed at this scale.
  */
  async function acquireCooldownLock(uid) {
  const lockRef = db.collection(“users”).doc(uid).collection(”_engine”).doc(“performanceLock”);
  const lockSnap = await lockRef.get();

if (lockSnap.exists) {
const data = lockSnap.data();
const nextAllowed = data.nextAllowedAt && data.nextAllowedAt.toDate
? data.nextAllowedAt.toDate()
: new Date(0);
if (new Date() < nextAllowed) {
return false; // Still in cooldown
}
}

// Acquire lock
await lockRef.set({
inProgress: true,
nextAllowedAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + COOLDOWN_MS)),
lastRunAt: admin.firestore.FieldValue.serverTimestamp(),
}, { merge: true });

return true;
}

async function releaseLock(uid, ok, error) {
const lockRef = db.collection(“users”).doc(uid).collection(”_engine”).doc(“performanceLock”);
await lockRef.set({
inProgress: false,
lastRunOk: ok,
lastError: error || null,
}, { merge: true });
}

// ── Exports ──────────────────────────────────

module.exports = {
computeAndWritePerformanceForUser,
acquireCooldownLock,
releaseLock,
getWeekKey,
COOLDOWN_MS,
};