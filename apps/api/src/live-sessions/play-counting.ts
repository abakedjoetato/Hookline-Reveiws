import { generateUuidV7 } from "@platform/database";
import {
  PLAY_COUNT_WINDOW_MS,
  QUALIFICATION_CONTINUOUS_PLAYBACK_MS,
} from "@platform/config";

/**
 * Play-counting rule
 * ------------------
 * A track can be played as many times as a host likes. A play only *counts*
 * (towards weekly top 3 and play stats) when:
 *   1. it reached 120 seconds of continuous playback, and
 *   2. the same track has not already had a counted play for the same host
 *      in the previous 4 hours.
 *
 * Paid and free plays follow the same rule. The window is per host, across
 * all of that host's stations and live sessions.
 */

export function normalizeTrackKeyPart(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function buildPlayTrackKey(input: {
  sourceTrackId?: string | null;
  songName?: string | null;
  artistName?: string | null;
}): string {
  if (input.sourceTrackId) return `track:${input.sourceTrackId}`;
  return `ext:${normalizeTrackKeyPart(input.songName)}|${normalizeTrackKeyPart(input.artistName)}`;
}

export function hasQualifyingDuration(
  loadedIntoPlayerAt: Date | null | undefined,
  now: Date,
): boolean {
  if (!loadedIntoPlayerAt) return false;
  return now.getTime() - loadedIntoPlayerAt.getTime() >= QUALIFICATION_CONTINUOUS_PLAYBACK_MS;
}

/**
 * Pure version of the rule, used for tests and for any batch recalculation:
 * given a host's qualifying plays of one track in time order, returns which
 * ones count.
 */
export function selectCountedPlays(timestamps: Date[]): boolean[] {
  let lastCounted = -Infinity;
  return timestamps.map((ts) => {
    const t = ts.getTime();
    if (t - lastCounted >= PLAY_COUNT_WINDOW_MS) {
      lastCounted = t;
      return true;
    }
    return false;
  });
}

/**
 * Records a qualifying play inside an open transaction and decides whether it
 * counts. Takes a transaction-scoped advisory lock on (host, track) so two
 * simultaneous completions can't both count.
 */
export async function recordQualifyingPlay(
  tx: any,
  params: {
    queueEntryId: string;
    liveSessionId: string;
    hostUserId: string;
    now: Date;
  },
): Promise<{ counted: boolean; playTrackKey: string }> {
  const entry = await tx.queueEntry.findUnique({
    where: { id: params.queueEntryId },
    include: {
      submission: {
        include: { trackSnapshot: true, sourceTrack: true, artistIdentity: true },
      },
    },
  });
  if (!entry) return { counted: false, playTrackKey: "" };

  const sub = entry.submission;
  const playTrackKey = buildPlayTrackKey({
    sourceTrackId: sub?.sourceTrackId,
    songName: sub?.trackSnapshot?.songName ?? sub?.sourceTrack?.songName,
    artistName: sub?.trackSnapshot?.artistName ?? sub?.artistIdentity?.artistName,
  });

  const lockKey = `${params.hostUserId}:${playTrackKey}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;

  const windowStart = new Date(params.now.getTime() - PLAY_COUNT_WINDOW_MS);
  const recentCounted = await tx.queueEntry.findFirst({
    where: {
      countedHostUserId: params.hostUserId,
      playTrackKey,
      countedAsPlay: true,
      countedPlayAt: { gt: windowStart },
      id: { not: params.queueEntryId },
    },
    select: { id: true },
  });

  const counted = !recentCounted;

  await tx.queueEntry.update({
    where: { id: params.queueEntryId },
    data: {
      playTrackKey,
      countedHostUserId: params.hostUserId,
      countedAsPlay: counted,
      countedPlayAt: counted ? params.now : null,
    },
  });

  await tx.playbackEvent.create({
    data: {
      id: generateUuidV7(),
      liveSessionId: params.liveSessionId,
      queueEntryId: params.queueEntryId,
      eventType: counted ? "QUALIFIED_PLAY" : "QUALIFIED_PLAY_NOT_COUNTED",
      timestamp: params.now,
    },
  });

  return { counted, playTrackKey };
}
