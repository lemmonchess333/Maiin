# Road-Aware Route Planning (Run11 — Mapbox)

Adopted 2026-07-17 from the operator rollout packet, amended for the
Run11 lock's **Pro gate** (retained — see the plan-file STATUS line for
the Mapbox-supersedes-ORS decision and its reason: ORS's free tier
requires approval for commercial use).

## What Is Implemented

The existing map planner remains fully usable without a routing
provider: a member taps points, closes a loop, and saves the resulting
point-to-point route. When enabled, this optional layer adds two
server-backed, **Pro-only** actions:

- **Align to roads** connects 2–12 manual points using Mapbox's walking
  network and returns the road polyline and distance.
- **Generate a loop** uses the first map point as the start, seeds a
  bounded square for 3 / 5 / 10 / 15 km, and calibrates against the
  routed distance in at most four provider calls.

The browser never receives the routing token. The `planRunningRoute`
callable returns only route geometry, distance, and optional duration;
it does not persist or log request coordinates (failures log action +
bounded error code only). A route is stored only through the existing
private saved-route flow when the member presses Save & follow.

## Founder Setup

Do these in order. **The secret binding is a deploy gate**: once this
code is on main, every functions deploy fails until the secret exists
(the same safety gate as issue #1636's RESEND_API_KEY) — so provision
BEFORE merging the PR.

1. Create a Mapbox account with billing enabled and a dedicated
   production token scoped to the Directions API.
2. Provision + verify from the repository root:

   ```bash
   firebase functions:secrets:set MAPBOX_DIRECTIONS_TOKEN --project adaptive-fitness-af8bb
   cd functions && npm run secrets:check && cd ..
   ```

3. Merge the PR; the CI functions deploy ships the callable. Spot-check
   the deployed source contains `planRunningRoute` (dedup gotcha).
4. Make one authenticated staging request from a Pro test account.
5. Set `VITE_ROUTE_PLANNING_ENABLED=true` in the production web build
   env, deploy the web app, and rebuild native apps. Keep it `false`
   everywhere else until the staging check passes. Never put the token
   in a `VITE_*` variable, Actions variable, browser bundle, or native
   app.
6. Re-check Mapbox pricing before every scale decision. At assessment
   time Mapbox lists 100,000 Directions requests/month free, then
   usage pricing — a launch runway, not a permanent guarantee. Add the
   GCP budget alert from the pre-launch backlog if not already set.

## Guardrails (implemented)

- Authentication + **Pro entitlement** (`computeEffectiveTier`) checked
  server-side on every request — the token lives only in Secret
  Manager, so the gate is enforceable.
- Align: 15 requests / user / 10 min. Loops: 4 / user / 10 min, each
  loop ≤4 provider calls. Deletion actor-lock applies.
- ≤12 manual waypoints in; ≤5,000 geometry points out (uniform
  downsample, endpoints preserved). The loop calibration SEED perimeter
  clamps to 1 km–marathon — the routed distance the network returns for
  that seed is whatever it is; calibration stops once the clamp pins
  the perimeter (a re-request would be byte-identical).
- The client invalidates in-flight results when the member edits the
  map or closes the planner (request nonce), so an old response cannot
  overwrite a newer draft.
- The Privacy Policy names Mapbox and the coordinate transfer.

## Manual Staging Checklist

1. Flag off: the planner shows no road-routing controls and still saves
   point-to-point routes. Free account with flag on: no road controls.
2. Pro + flag on: 2- and 3-point routes — the dashed draft becomes a
   solid road line only on success; saved distance matches the road
   route.
3. One start point → each loop distance; the returned loop starts and
   ends near the selected area; displayed distance is authoritative.
4. Edit/clear points while a request is loading — the stale response
   must not replace the new map state.
5. 393px viewport, light + dark, denied location permission,
   no-network, and a start point near water/sparse paths.
6. Cloud logs show `routePlanning.failed` with action + code only —
   never raw coordinates or a token.
7. Confirm Mapbox attribution (© Mapbox shown with road results),
   token scope, terms, and pricing before public rollout.

## Deliberately Deferred

Address/POI search; elevation/surface/safety scoring; turn-by-turn
navigation and offline maps; public route discovery (saved routes stay
private — sharing needs its own privacy-zone, moderation, and consent
review).

## Provider References

- [Mapbox Directions API](https://docs.mapbox.com/api/navigation/directions/)
- [Mapbox pricing](https://www.mapbox.com/pricing)
- [openrouteservice ToS](https://openrouteservice.org/terms-of-service/)
  (why ORS was superseded: commercial use of the free tier requires
  approval)
