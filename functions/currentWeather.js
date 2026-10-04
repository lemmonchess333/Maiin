/**
 * getCurrentWeather — the current weather for the pre-run strip
 * (RunSetupModal), from MET Norway, for signed-in users.
 *
 * The phone never calls a weather service itself. This proxy asks MET
 * Norway, whose data may be used commercially and is credited in the app
 * as "Weather data from MET Norway"; Open-Meteo's free API, which the
 * phone once called, is for non-commercial use only. MET sees this
 * server, not the phone: no IP address, and a place rounded to two
 * decimal places. The client rounds before sending and the server rounds
 * again.
 *
 * lib/metWeather.js owns the pure logic: the symbol mapping, feels-like,
 * the per-place cache that honours MET's Expires header. This module owns
 * the trigger: auth, the per-user rate limit, and the error mapping.
 * Coordinates are never logged; a failure logs its code and HTTP status.
 *
 * Index re-exports `getCurrentWeather`, so the deployed name, cap and
 * (absent) secrets are pinned by __tests__/triggerMetadata.test.js.
 */
const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const { DEFAULT_HTTP_CAP } = require("./lib/runtimeCaps");
const accountDeletionLocks = require("./lib/accountDeletionLocks");
const rateLimiter = require("./rateLimiter");
const metWeather = require("./lib/metWeather");

/* Generous: the client keeps a reading for ten minutes, so a person
   opening run setup over and over asks a few times an hour at most. The
   limit is there for a script, which could otherwise walk new places past
   the cache and have MET throttle every user's weather. */
const WEATHER_CALLS_PER_HOUR = 30;
const ONE_HOUR_MS = 60 * 60 * 1000;

/* One service per function instance, so the cache is shared by every
   request the instance serves. `fetch` is looked up per call, which is
   what lets a test stub the global. */
const service = metWeather.createWeatherService({
  fetchImpl: (...args) => fetch(...args),
  warn: (event) => functions.logger.warn(event),
});

exports.getCurrentWeather = functions
  .runWith({ ...DEFAULT_HTTP_CAP })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Sign in first.");
    }
    const uid = context.auth.uid;
    const firestore = admin.firestore();
    await accountDeletionLocks.assertCallableActorNotDeleting(firestore, uid);
    const limited = await rateLimiter.isRateLimited(
      firestore,
      uid,
      "weather",
      WEATHER_CALLS_PER_HOUR,
      ONE_HOUR_MS
    );
    if (limited) {
      throw new functions.https.HttpsError(
        "resource-exhausted",
        "Too many weather requests. Try again later."
      );
    }
    try {
      return await service.currentWeather(data && data.lat, data && data.lon);
    } catch (error) {
      if (error instanceof metWeather.WeatherError) {
        functions.logger.warn("weather.failed", {
          code: error.code,
          status: typeof error.status === "number" ? error.status : null,
        });
        if (error.code === "invalid-request") {
          throw new functions.https.HttpsError(
            "invalid-argument",
            "Invalid coordinates."
          );
        }
        throw new functions.https.HttpsError(
          "unavailable",
          "Weather is unavailable right now."
        );
      }
      throw error;
    }
  });

/** Test surface: the instance's service, so a suite can empty its cache. */
exports._weatherService = service;
exports.WEATHER_CALLS_PER_HOUR = WEATHER_CALLS_PER_HOUR;
