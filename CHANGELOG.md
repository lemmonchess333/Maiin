# Changelog

All notable user-facing changes to Tropos are documented here. The format is
based on [Keep a Changelog](https://keepachangelog.com/), and the project
follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- Food shows your usual meal without focusing the composer, remembers portions and meal slots, previews copies, and queues offline entries with a five-second Undo. Examples prefill the composer without logging.

- **Readability pass across the whole app.** Secondary text is slightly
  darker in light mode and slightly brighter in dark mode, tuned so every
  caption clears accessibility contrast on the surface it actually sits
  on. The dozens of small labels that previously rendered too faint —
  badge progress, challenge milestones, analytics verdicts, deload
  advisories, chart deltas — are now legible in both themes.
- **Warnings look like warnings.** Cautionary messages (deload
  suggestions, injury flags, form cues, off-route alerts) now use a
  distinct amber, separate from the orange that marks food and calories —
  previously the two were the same colour.
- **The live run screen is easier to read on the move.** Stat labels and
  run controls moved up from 8–9px to a consistent legible size with
  proper contrast, and the stats panel now has two positions — compact
  bar or expanded — instead of three, removing a middle stop that showed
  nothing extra.
- **One date and one unit style everywhere.** Dates render day-first
  ("22 Aug", "Saturday 23 August") regardless of the phone's region —
  previously several screens (and shared workout images) showed the
  American order on US-region devices. Units are consistently spaced
  ("60 kg", "5.2 km", "400 m").
- **Small layout fixes.** Horizontal carousels (Spaces, Races) no longer
  pin their first card flush to the screen edge; the duplicate
  "Performance" label on Home is gone; PR trophies use one consistent
  gold; badge and challenge tier colours stay on the artwork instead of
  making text unreadable.

### Important — sync before updating

- **Offline changes queued by an older version are discarded when you update.**
  Offline logging is now scoped to the signed-in account, so on a shared
  device one person's pending changes can no longer be uploaded under
  someone else's account. The trade-off is one-time: anything still
  waiting to sync from a **pre-update** version can't be safely attributed
  to an account, so the updated app discards it rather than guess. If
  you've logged food or sessions while offline, open the app online once
  (so the queue flushes) before installing an update. Changes queued by
  the updated app survive future updates normally.

## [1.2.0] — 2026-06-11

Two feature arcs: **Partner Streaks** (train consistently with a friend) and a
**solo-first Social tab** that's designed for day one, with social features
that switch on as your network grows.

### Added

- **Partner Streaks.** Pair up with a friend you both follow and build a shared
  streak that grows every calendar day you _both_ log a workout or run.
  - Start (or end) a streak from any mutual-follower's profile — no requests or
    approvals.
  - One automatic **freeze per partner, per week** bridges a single missed day
    so an off day doesn't wipe a long streak.
  - Keep separate streaks with up to **5 partners** at once.
- **Solo-first Social home.** New members with no partners or crew now land on a
  curated stack instead of an empty feed: a partner-streak invite, the monthly
  global challenge, a share-your-training card, and a crew invite.
- **Monthly global challenge — "Hybrid Hero".** A challenge you can win solo,
  against a target number rather than friends. Kilometres run **and** kilograms
  lifted both count toward one monthly goal; one-tap join; progress comes from
  the sessions you already log. Once a challenge has **50+ athletes**, you'll
  see your percentile ("top 40% this month").

### Changed

- **Social features now activate with your network**, so nothing reads as
  half-empty:
  - Your **Following feed** appears once you follow **3+** people.
  - **Crew leaderboards** unlock at **3+** crew members (an invite prompt shows
    until then).
  - **Athlete leaderboards** appear at **20+** active athletes and always show
    your _neighbourhood_ (the athletes just above and below you) with your
    percentile — never a giant global ranking.

### Fixed

- The **Autumn Push** seasonal challenge now accrues progress correctly (it
  previously declared a hybrid score but never advanced).

[1.2.0]: https://github.com/lemmonchess333/Maiin/releases/tag/v1.2.0
