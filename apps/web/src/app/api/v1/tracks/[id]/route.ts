import { NextRequest, NextResponse } from "next/server";
import { serverDb } from "@/lib/server-state";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const track = serverDb.tracks.get(params.id);
  if (!track) {
    return NextResponse.json(
      { message: "Track not found", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  return NextResponse.json(track);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const track = serverDb.tracks.get(params.id);
  if (!track) {
    return NextResponse.json(
      { message: "Track not found", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  serverDb.tracks.delete(params.id);
  return NextResponse.json({ success: true });
}
