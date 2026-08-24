import { NextRequest, NextResponse } from "next/server";
import { serverDb } from "@/lib/server-state";
import { TrackSummary } from "@platform/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const tracks: TrackSummary[] = Array.from(serverDb.tracks.values()).map((t) => ({
    id: t.id,
    userId: t.userId,
    artistIdentityId: t.artistIdentityId,
    songName: t.songName,
    albumName: t.albumName,
    explicitContent: t.explicitContent,
    bpm: t.bpm,
    musicalKey: t.musicalKey,
    durationSeconds: t.durationSeconds,
    processingState: t.processingState,
    artistIdentity: t.artistIdentity,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  }));

  return NextResponse.json(tracks);
}
