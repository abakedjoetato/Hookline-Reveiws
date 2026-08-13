import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaClient, Prisma } from "@platform/database";
import { ReorderQueueEntryDto, SafeQueueEntryResponse } from "./dto/live-session.dto";

// Precision check configuration: minimal gap size
const MIN_GAP = 0.00000001;

@Injectable()
export class QueueOrderingService {
  constructor(private readonly prisma: PrismaClient) {}

  async reorderEntry(
    userId: string,
    sessionId: string,
    entryId: string,
    dto: ReorderQueueEntryDto
  ): Promise<SafeQueueEntryResponse> {
    return this.prisma.$transaction(async (tx) => {
      // 1. Authoritative Concurrency Lock (same as Slice 1)
      const lockedSessions = await tx.$queryRaw<any[]>`
        SELECT id, status, "hostId", "queueRevision" FROM "live_sessions" WHERE id = ${sessionId}::uuid FOR UPDATE
      `;

      if (!lockedSessions.length) {
        throw new NotFoundException("Live session not found");
      }

      const session = lockedSessions[0];

      if (session.hostId !== userId) {
        throw new ForbiddenException("You do not own this live session");
      }

      if (session.queueRevision !== dto.expectedQueueRevision) {
        throw new ConflictException("Stale queue revision");
      }

      // 2. Validate Target Entry
      const entry = await tx.queueEntry.findUnique({
        where: { id: entryId },
        include: { submission: true }
      });

      if (!entry || entry.liveSessionId !== sessionId) {
        throw new NotFoundException("Entry not found in this session");
      }

      const priorityGroup = entry.priorityRank;

      // 3. Resolve Target Position
      // Load current queue state for this priority group
      let priorityEntries = await tx.queueEntry.findMany({
        where: {
          liveSessionId: sessionId,
          priorityRank: priorityGroup
        },
        orderBy: { sortOrder: 'asc' },
      });

      // Target resolution
      let newSortOrder: Prisma.Decimal;
      let needsRebalance = false;

      // Helper function to resolve midpoint safely
      const calculateMidpoint = (before: Prisma.Decimal | number, after: Prisma.Decimal | number): Prisma.Decimal => {
        const b = Number(before);
        const a = Number(after);
        if (a - b < MIN_GAP) {
          needsRebalance = true;
          return new Prisma.Decimal(a); // Return dummy value, rebalance will fix it
        }
        return new Prisma.Decimal(b + (a - b) / 2);
      };

      if (dto.intent === 'TOP') {
        const first = priorityEntries[0];
        if (!first || first.id === entry.id) {
          newSortOrder = entry.sortOrder; // No change needed
        } else {
          newSortOrder = new Prisma.Decimal(Number(first.sortOrder) - 1000);
        }
      } else if (dto.intent === 'BOTTOM') {
        const last = priorityEntries[priorityEntries.length - 1];
        if (!last || last.id === entry.id) {
          newSortOrder = entry.sortOrder; // No change needed
        } else {
          newSortOrder = new Prisma.Decimal(Number(last.sortOrder) + 1000);
        }
      } else if (dto.intent === 'BEFORE' || dto.intent === 'AFTER') {
        if (!dto.targetEntryId) {
          throw new BadRequestException("Target entry ID is required for relative intents");
        }

        const relativeTarget = await tx.queueEntry.findUnique({
          where: { id: dto.targetEntryId }
        });

        if (!relativeTarget || relativeTarget.liveSessionId !== sessionId) {
          throw new BadRequestException("Invalid target entry");
        }

        // --- CLAMPING LOGIC ---
        // If the target is OUTSIDE our priority rank, we clamp.
        if (relativeTarget.priorityRank > priorityGroup) {
          // Dragged above into higher priority -> clamp to TOP of current group
          const first = priorityEntries[0];
          newSortOrder = (!first || first.id === entry.id) ? entry.sortOrder : new Prisma.Decimal(Number(first.sortOrder) - 1000);
        } else if (relativeTarget.priorityRank < priorityGroup) {
          // Dragged below into lower priority -> clamp to BOTTOM of current group
          const last = priorityEntries[priorityEntries.length - 1];
          newSortOrder = (!last || last.id === entry.id) ? entry.sortOrder : new Prisma.Decimal(Number(last.sortOrder) + 1000);
        } else {
          // Inside legal group -> Find exactly BEFORE or AFTER relative target
          const targetIndex = priorityEntries.findIndex(e => e.id === relativeTarget.id);

          if (dto.intent === 'BEFORE') {
            const previousNeighbor = targetIndex > 0 ? priorityEntries[targetIndex - 1] : null;
            if (previousNeighbor && previousNeighbor.id === entry.id) {
              newSortOrder = entry.sortOrder; // Already there
            } else if (previousNeighbor) {
              newSortOrder = calculateMidpoint(previousNeighbor.sortOrder, relativeTarget.sortOrder);
            } else {
              newSortOrder = new Prisma.Decimal(Number(relativeTarget.sortOrder) - 1000); // Top
            }
          } else {
            // AFTER
            const nextNeighbor = targetIndex < priorityEntries.length - 1 ? priorityEntries[targetIndex + 1] : null;
            if (nextNeighbor && nextNeighbor.id === entry.id) {
              newSortOrder = entry.sortOrder; // Already there
            } else if (nextNeighbor) {
              newSortOrder = calculateMidpoint(relativeTarget.sortOrder, nextNeighbor.sortOrder);
            } else {
              newSortOrder = new Prisma.Decimal(Number(relativeTarget.sortOrder) + 1000); // Bottom
            }
          }
        }
      }

      // 4. Precision Exhaustion Rebalancing
      if (needsRebalance) {
        // Logically remove the moving entry from the list
        priorityEntries = priorityEntries.filter(e => e.id !== entry.id);

        // Find logical insertion index for the new entry based on intent
        // and rebuild the array
        let insertionIndex = priorityEntries.length; // Default to end

        if (dto.intent === 'TOP' || (dto.intent === 'BEFORE' && dto.targetEntryId && priorityEntries.find(e => e.id === dto.targetEntryId && e.sortOrder > newSortOrder))) {
            // For true logical insertion, we just simulate the insertion
        }

        // Force a stable logical order using JS sorting
        priorityEntries.push({...entry, sortOrder: newSortOrder});
        priorityEntries.sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder));

        // Rebalance the group to whole thousands
        let nextValue = 1000;
        for (const e of priorityEntries) {
          if (e.id === entry.id) {
            newSortOrder = new Prisma.Decimal(nextValue);
          } else {
            await tx.queueEntry.update({
              where: { id: e.id },
              data: { sortOrder: nextValue }
            });
          }
          nextValue += 1000;
        }
      }

      // 5. Apply the Mutation
      const updatedEntry = await tx.queueEntry.update({
        where: { id: entry.id },
        data: { sortOrder: newSortOrder },
        include: { submission: true }
      });

      // Increment queue revision safely
      await tx.liveSession.update({
        where: { id: sessionId, queueRevision: dto.expectedQueueRevision },
        data: { queueRevision: { increment: 1 } },
      });

      return {
        id: updatedEntry.id,
        liveSessionId: updatedEntry.liveSessionId,
        status: updatedEntry.status,
        sortOrder: Number(updatedEntry.sortOrder),
        priorityRank: updatedEntry.priorityRank,
        submission: {
          id: updatedEntry.submission.id,
          isPriority: updatedEntry.submission.isPriority,
          currentQueueStatus: updatedEntry.submission.currentQueueStatus,
          submittedAt: updatedEntry.submission.submittedAt,
        }
      };
    });
  }
}
