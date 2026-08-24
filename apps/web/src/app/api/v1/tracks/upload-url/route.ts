import { NextRequest, NextResponse } from "next/server";
import { serverDb, StoredTrack } from "@/lib/server-state";
import {
  CreateTrackUploadUrlDto,
  CreateUploadUrlResponse,
  ProcessingState,
} from "@platform/types";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body: CreateTrackUploadUrlDto = await req.json();

  const trackId = `track_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const uploadIntentId = `intent_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  // Store intent
  serverDb.uploadIntents.set(uploadIntentId, {
    trackId,
    intentId: uploadIntentId,
    metadata: body,
    expiresAt: new Date(Date.now() + 3600000),
  });

  // Pre-create track in UPLOADING/PROCESSING state
  const newTrack: StoredTrack = {
    id: trackId,
    userId: "current-user",
    artistIdentityId: "artist-identity-1",
    songName: body.songName,
    albumName: body.albumName || null,
    explicitContent: Boolean(body.explicitContent),
    bpm: body.bpm || null,
    musicalKey: body.musicalKey || null,
    durationSeconds: Math.floor(Math.random() * 90) + 150, // simulated duration 2:30 - 4:00
    processingState: ProcessingState.PROCESSING,
    artistIdentity: {
      id: "artist-identity-1",
      artistName: body.artistName,
    },
    originalFilename: body.originalFilename,
    mimeType: body.mimeType,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  serverDb.tracks.set(trackId, newTrack);

  const response: CreateUploadUrlResponse = {
    trackId,
    uploadIntentId,
    uploadUrl: `/api/v1/mock-upload/${uploadIntentId}`,
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
  };

  return NextResponse.json(response);
}
