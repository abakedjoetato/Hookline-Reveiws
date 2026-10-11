import { generateUuidV7 } from "@platform/database";

/**
 * Appends a QueueEvent with the next per-session sequence number.
 * (liveSessionId, eventSequence) is unique, so the number is reserved by an
 * atomic increment on the session row inside the caller's transaction.
 */
export async function appendQueueEvent(
  tx: any,
  data: {
    queueEntryId: string;
    liveSessionId: string;
    actingUserId?: string | null;
    eventType: string;
    previousState?: string | null;
    newState: string;
    previousPosition?: number | null;
    newPosition?: number | null;
    reason?: string | null;
    batchOperationId?: string | null;
    requestId?: string | null;
    correlationId?: string | null;
    publicVisibility?: boolean;
  },
) {
  const { lastEventSequence } = await tx.liveSession.update({
    where: { id: data.liveSessionId },
    data: { lastEventSequence: { increment: 1 } },
    select: { lastEventSequence: true },
  });
  return tx.queueEvent.create({
    data: { id: generateUuidV7(), ...data, eventSequence: lastEventSequence },
  });
}
