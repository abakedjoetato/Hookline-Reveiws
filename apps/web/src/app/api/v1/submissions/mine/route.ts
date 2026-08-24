import { NextResponse } from "next/server";
import { serverDb } from "@/lib/server-state";
import { UserSubmissionSummary } from "@platform/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const submissions: UserSubmissionSummary[] = Array.from(
    serverDb.submissions.values(),
  ).map((sub) => {
    // Keep live queue position updated from the corresponding session queue
    const sessionQueue = serverDb.queues.get(sub.liveSessionId) || [];
    const queueEntry = sessionQueue.find((e) => e.submissionId === sub.id);

    return {
      id: sub.id,
      liveSessionId: sub.liveSessionId,
      sessionTitle: sub.sessionTitle,
      sessionStatus: sub.sessionStatus,
      stationName: sub.stationName,
      songName: sub.songName,
      artistName: sub.artistName,
      durationSeconds: sub.durationSeconds,
      isPriority: sub.isPriority,
      tierName: sub.tierName,
      tierColorSlot: sub.tierColorSlot,
      currentQueueStatus: queueEntry ? queueEntry.status : sub.currentQueueStatus,
      submittedAt: sub.submittedAt,
      queueEntry: queueEntry
        ? {
            id: queueEntry.id,
            status: queueEntry.status,
            priorityRank: queueEntry.priorityRank,
            sortOrder: queueEntry.sortOrder,
          }
        : sub.queueEntry,
    };
  });

  return NextResponse.json(submissions);
}
