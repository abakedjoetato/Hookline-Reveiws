# ADR 0028: Play Counting — Once per Track, per Host, per 4 Hours

## Status

Accepted (supersedes the "paid priority plays count immediately" rule)

## Decision

- A host may play any track **any number of times**. Nothing blocks a replay.
- A play is a **qualifying play** when the track reaches 120 seconds of continuous playback.
- A qualifying play **counts** only if the same track has no other counted play **for the same host** in the preceding 4 hours. The window spans all of the host's stations and live sessions.
- Free-line and paid plays follow the same rule. Paying for priority buys queue position, not extra counted plays.

## Implementation

- The decision is made once, at play time, in `apps/api/src/live-sessions/play-counting.ts` and stored on the queue entry (`countedAsPlay`, `countedPlayAt`, `playTrackKey`, `countedHostUserId`).
- A transaction-scoped Postgres advisory lock on `(host, track)` stops two simultaneous completions from both counting.
- Track identity is the library track id; external links fall back to normalized `song|artist`.
- Weekly Top 3 and play statistics read the stored flag instead of recomputing the window.
- The window length is `PLAY_COUNT_WINDOW_MS` in `@platform/config`.

## Consequences

- Rankings are cheap to compute and never change retroactively.
- Plays that didn't count are still recorded (`QUALIFIED_PLAY_NOT_COUNTED` playback events) for audit.
