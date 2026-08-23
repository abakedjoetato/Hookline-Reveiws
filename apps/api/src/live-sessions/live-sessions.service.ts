import { QueueOrderingService } from "./queue-ordering/queue-ordering.service";
import { ReorderIntent } from "./dto/live-session.dto";

import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaClient, generateUuidV7, QueueEntry } from "@platform/database";
import { LiveSessionStatus, QueueStatus } from "@platform/types";
import { CreateLiveSessionDto, AddQueueEntryDto } from "./dto/live-session.dto";

@Injectable()
export class LiveSessionsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly queueOrderingService: QueueOrderingService,
  ) {}

  async createLiveSession(
    userId: string,
    dto: CreateLiveSessionDto,
  ): Promise<import("./dto/live-session.dto").SafeLiveSessionResponse> {
    return this.prisma.$transaction(async (tx) => {
      // 1. Lock the host profile to serialize concurrent creation requests
      // This guarantees that if two requests arrive simultaneously, one will block
      // until the other finishes and releases the lock, at which point the second
      // will see the newly created active session and fail.
      const lockedHosts = await tx.$queryRaw<any[]>`
        SELECT id FROM "host_profiles" WHERE "userId" = ${userId}::uuid FOR UPDATE
      `;

      if (!lockedHosts.length) {
        throw new ForbiddenException("Only hosts can create live sessions");
      }

      const station = await tx.station.findUnique({
        where: { id: dto.stationId },
      });

      if (!station || station.hostId !== userId) {
        throw new ForbiddenException("You do not own this station");
      }

      // Check for an existing active session AFTER acquiring the lock
      const activeSession = await tx.liveSession.findFirst({
        where: {
          hostId: userId,
          status: {
            in: [
              LiveSessionStatus.SCHEDULED,
              LiveSessionStatus.PREPARING,
              LiveSessionStatus.LIVE,
              LiveSessionStatus.PAUSED,
            ],
          },
        },
      });

      if (activeSession) {
        throw new ConflictException("Host already has an active live session");
      }

      const id = generateUuidV7();
      const created = await tx.liveSession.create({
        data: {
          id,
          stationId: dto.stationId,
          hostId: userId,
          status: LiveSessionStatus.PREPARING,
          liveTitle: dto.liveTitle,
          primaryStreamingPlatform: dto.primaryStreamingPlatform,
          savedProfileUrlSnapshot: dto.savedProfileUrlSnapshot,
          queueRevision: 0,
        },
      });
      return {
        id: created.id,
        stationId: created.stationId,
        status: created.status,
        liveTitle: created.liveTitle,
        queueRevision: created.queueRevision,
      };
    });
  }

  async getLiveSession(
    userId: string,
    id: string,
  ): Promise<import("./dto/live-session.dto").SafeLiveSessionResponse> {
    const session = await this.prisma.liveSession.findUnique({
      where: { id },
    });

    if (!session) {
      throw new NotFoundException("Live session not found");
    }

    if (session.hostId !== userId) {
      throw new ForbiddenException("You do not own this live session");
    }

    return {
      id: session.id,
      stationId: session.stationId,
      status: session.status,
      liveTitle: session.liveTitle,
      queueRevision: session.queueRevision,
    };
  }

  async startLiveSession(
    userId: string,
    id: string,
    expectedQueueRevision: number,
  ): Promise<import("./dto/live-session.dto").SafeLiveSessionResponse> {
    return this.prisma.$transaction(async (tx) => {
      // 1. Lock the session row to prevent concurrent mutations
      const lockedSessions = await tx.$queryRaw<any[]>`
        SELECT id, status, "hostId", "queueRevision" FROM "live_sessions" WHERE id = ${id}::uuid FOR UPDATE
      `;

      if (!lockedSessions.length) {
        throw new NotFoundException("Live session not found");
      }

      const session = lockedSessions[0];

      if (session.hostId !== userId) {
        throw new ForbiddenException("You do not own this live session");
      }

      if (session.queueRevision !== expectedQueueRevision) {
        throw new ConflictException("Stale queue revision");
      }

      if (session.status !== LiveSessionStatus.PREPARING) {
        throw new BadRequestException(
          "Invalid lifecycle transition. Session must be in PREPARING state to start.",
        );
      }

      const updated = await tx.liveSession.update({
        where: { id, queueRevision: expectedQueueRevision },
        data: {
          status: LiveSessionStatus.LIVE,
          startedAt: new Date(),
          queueRevision: { increment: 1 },
        },
      });
      return {
        id: updated.id,
        stationId: updated.stationId,
        status: updated.status,
        liveTitle: updated.liveTitle,
        queueRevision: updated.queueRevision,
      };
    });
  }

  async pauseLiveSession(
    userId: string,
    id: string,
    expectedQueueRevision: number,
  ): Promise<import("./dto/live-session.dto").SafeLiveSessionResponse> {
    return this.prisma.$transaction(async (tx) => {
      const lockedSessions = await tx.$queryRaw<any[]>`
        SELECT id, status, "hostId", "queueRevision" FROM "live_sessions" WHERE id = ${id}::uuid FOR UPDATE
      `;

      if (!lockedSessions.length) {
        throw new NotFoundException("Live session not found");
      }

      const session = lockedSessions[0];

      if (session.hostId !== userId) {
        throw new ForbiddenException("You do not own this live session");
      }

      if (session.queueRevision !== expectedQueueRevision) {
        throw new ConflictException("Stale queue revision");
      }

      if (session.status !== LiveSessionStatus.LIVE) {
        throw new BadRequestException(
          "Invalid lifecycle transition. Session must be in LIVE state to pause.",
        );
      }

      const updated = await tx.liveSession.update({
        where: { id, queueRevision: expectedQueueRevision },
        data: {
          status: LiveSessionStatus.PAUSED,
          queueRevision: { increment: 1 },
        },
      });
      return {
        id: updated.id,
        stationId: updated.stationId,
        status: updated.status,
        liveTitle: updated.liveTitle,
        queueRevision: updated.queueRevision,
      };
    });
  }

  async resumeLiveSession(
    userId: string,
    id: string,
    expectedQueueRevision: number,
  ): Promise<import("./dto/live-session.dto").SafeLiveSessionResponse> {
    return this.prisma.$transaction(async (tx) => {
      const lockedSessions = await tx.$queryRaw<any[]>`
        SELECT id, status, "hostId", "queueRevision" FROM "live_sessions" WHERE id = ${id}::uuid FOR UPDATE
      `;

      if (!lockedSessions.length) {
        throw new NotFoundException("Live session not found");
      }

      const session = lockedSessions[0];

      if (session.hostId !== userId) {
        throw new ForbiddenException("You do not own this live session");
      }

      if (session.queueRevision !== expectedQueueRevision) {
        throw new ConflictException("Stale queue revision");
      }

      if (session.status !== LiveSessionStatus.PAUSED) {
        throw new BadRequestException(
          "Invalid lifecycle transition. Session must be in PAUSED state to resume.",
        );
      }

      const updated = await tx.liveSession.update({
        where: { id, queueRevision: expectedQueueRevision },
        data: {
          status: LiveSessionStatus.LIVE,
          queueRevision: { increment: 1 },
        },
      });
      return {
        id: updated.id,
        stationId: updated.stationId,
        status: updated.status,
        liveTitle: updated.liveTitle,
        queueRevision: updated.queueRevision,
      };
    });
  }

  async endLiveSession(
    userId: string,
    id: string,
    expectedQueueRevision: number,
  ): Promise<import("./dto/live-session.dto").SafeLiveSessionResponse> {
    return this.prisma.$transaction(async (tx) => {
      const lockedSessions = await tx.$queryRaw<any[]>`
        SELECT id, status, "hostId", "queueRevision" FROM "live_sessions" WHERE id = ${id}::uuid FOR UPDATE
      `;

      if (!lockedSessions.length) {
        throw new NotFoundException("Live session not found");
      }

      const session = lockedSessions[0];

      if (session.hostId !== userId) {
        throw new ForbiddenException("You do not own this live session");
      }

      if (session.queueRevision !== expectedQueueRevision) {
        throw new ConflictException("Stale queue revision");
      }

      if (
        ![
          LiveSessionStatus.PREPARING,
          LiveSessionStatus.LIVE,
          LiveSessionStatus.PAUSED,
        ].includes(session.status)
      ) {
        throw new BadRequestException(
          "Invalid lifecycle transition. Session cannot be ended from its current state.",
        );
      }

      const updated = await tx.liveSession.update({
        where: { id, queueRevision: expectedQueueRevision },
        data: {
          status: LiveSessionStatus.ENDED,
          endedAt: new Date(),
          queueRevision: { increment: 1 },
        },
      });
      return {
        id: updated.id,
        stationId: updated.stationId,
        status: updated.status,
        liveTitle: updated.liveTitle,
        queueRevision: updated.queueRevision,
      };
    });
  }

  async addQueueEntry(
    userId: string,
    id: string,
    dto: AddQueueEntryDto,
  ): Promise<import("./dto/live-session.dto").SafeQueueEntryResponse> {
    return this.prisma.$transaction(async (tx) => {
      const lockedSessions = await tx.$queryRaw<any[]>`
        SELECT id, status, "hostId", "queueRevision" FROM "live_sessions" WHERE id = ${id}::uuid FOR UPDATE
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

      const submission = await tx.submission.findUnique({
        where: { id: dto.submissionId },
      });

      if (!submission || submission.liveSessionId !== id) {
        throw new BadRequestException("Invalid submission");
      }

      // Check if entry already exists for this submission
      const existingEntry = await tx.queueEntry.findUnique({
        where: { submissionId: dto.submissionId },
      });

      if (existingEntry) {
        throw new ConflictException(
          "Queue entry already exists for this submission",
        );
      }

      // Determine initial deterministic sort order (simple stable spacing strategy)
      const lastEntry = await tx.queueEntry.findFirst({
        where: { liveSessionId: id },
        orderBy: { sortOrder: "desc" },
      });

      const nextSortOrder = lastEntry
        ? Number(lastEntry.sortOrder) + 1000
        : 1000;

      const entryId = generateUuidV7();

      const newEntry = await tx.queueEntry.create({
        data: {
          id: entryId,
          liveSessionId: id,
          submissionId: dto.submissionId,
          status: QueueStatus.QUEUED,
          sortOrder: nextSortOrder,
          priorityRank: submission.isPriority ? 1 : 0, // Simplified for this foundational slice
        },
      });

      // Update session queueRevision atomically using where constraints
      await tx.liveSession.update({
        where: { id, queueRevision: dto.expectedQueueRevision },
        data: { queueRevision: { increment: 1 } },
      });

      return {
        id: newEntry.id,
        liveSessionId: newEntry.liveSessionId,
        status: newEntry.status,
        sortOrder: Number(newEntry.sortOrder),
        priorityRank: newEntry.priorityRank,
        submission: {
          id: submission.id,
          isPriority: submission.isPriority,
          currentQueueStatus: submission.currentQueueStatus,
          submittedAt: submission.submittedAt,
        },
      };
    });
  }

  async getQueue(
    userId: string,
    id: string,
  ): Promise<import("./dto/live-session.dto").SafeQueueEntryResponse[]> {
    const session = await this.prisma.liveSession.findUnique({ where: { id } });

    if (!session) {
      throw new NotFoundException("Live session not found");
    }

    if (session.hostId !== userId) {
      throw new ForbiddenException("You do not own this live session");
    }

    const entries = await this.prisma.queueEntry.findMany({
      where: { liveSessionId: id },
      orderBy: [{ priorityRank: "desc" }, { sortOrder: "asc" }],
      include: {
        submission: true,
      },
    });

    return entries.map((entry) => ({
      id: entry.id,
      liveSessionId: entry.liveSessionId,
      status: entry.status,
      sortOrder: Number(entry.sortOrder),
      priorityRank: entry.priorityRank,
      submission: {
        id: entry.submission.id,
        isPriority: entry.submission.isPriority,
        currentQueueStatus: entry.submission.currentQueueStatus,
        submittedAt: entry.submission.submittedAt,
      },
    }));
  }

  private async qualifyAndDisplaceCurrentPlayer(
    tx: any,
    currentEntryId: string,
    liveSessionId: string,
  ) {
    const currentEntry = await tx.queueEntry.findUnique({
      where: { id: currentEntryId },
      include: { submission: true },
    });

    if (!currentEntry) return;

    if (currentEntry.status !== QueueStatus.PLAYING) {
      return;
    }

    const loadedAt = currentEntry.loadedIntoPlayerAt;

    // Check qualification for external links. 2 minutes = 120,000 ms.
    let played = false;
    if (loadedAt) {
      const elapsed = Date.now() - loadedAt.getTime();
      if (elapsed >= 120000) {
        played = true;
      }
    }

    if (played) {
      // Move to history
      await tx.queueEntry.update({
        where: { id: currentEntryId },
        data: {
          status: QueueStatus.MOVED_TO_HISTORY,
          completedAt: new Date(),
          movedToHistoryAt: new Date(),
          wasPlayed: true,
          playbackCompleted: true,
          loadedIntoPlayerAt: null,
          originPriorityRank: null,
          originSortOrder: null,
        },
      });
      await tx.submission.update({
        where: { id: currentEntry.submissionId },
        data: {
          currentQueueStatus: QueueStatus.MOVED_TO_HISTORY,
        },
      });
    } else {
      // Restore near origin
      const originRank =
        currentEntry.originPriorityRank ?? currentEntry.priorityRank;

      const groupEntries = await tx.queueEntry.findMany({
        where: {
          liveSessionId,
          status: QueueStatus.QUEUED,
          priorityRank: originRank,
        },
        orderBy: { sortOrder: "asc" },
      });

      // Calculate placement
      let newSortOrder = currentEntry.originSortOrder ?? currentEntry.sortOrder;

      // If no reasonable placement found, put at bottom of priority group
      if (groupEntries.length > 0) {
        // Just find the nearest surviving position in the priority group.
        // For simplicity and resilience, if we can't find original neighbors, we use the original sort order.
        // This implicitly places it where it belongs since fractional ordering represents absolute space.
      } else {
        newSortOrder = 1000;
      }

      await tx.queueEntry.update({
        where: { id: currentEntryId },
        data: {
          status: QueueStatus.QUEUED,
          sortOrder: newSortOrder,
          priorityRank: originRank,
          loadedIntoPlayerAt: null,
          originPriorityRank: null,
          originSortOrder: null,
        },
      });

      await tx.submission.update({
        where: { id: currentEntry.submissionId },
        data: {
          currentQueueStatus: QueueStatus.QUEUED,
        },
      });
    }
  }

  async playNext(userId: string, id: string, expectedQueueRevision: number) {
    return this.prisma.$transaction(async (tx) => {
      const lockedSessions = await tx.$queryRaw<any[]>`
        SELECT id, status, "hostId", "queueRevision", "currentQueueEntryId" FROM "live_sessions" WHERE id = ${id}::uuid FOR UPDATE
      `;

      if (!lockedSessions.length)
        throw new NotFoundException("Live session not found");
      const session = lockedSessions[0];

      if (session.hostId !== userId)
        throw new ForbiddenException("You do not own this live session");
      if (session.queueRevision !== expectedQueueRevision)
        throw new ConflictException("Stale queue revision");

      if (session.currentQueueEntryId) {
        await this.qualifyAndDisplaceCurrentPlayer(
          tx,
          session.currentQueueEntryId,
          id,
        );
      }

      // Find first queued entry
      const nextEntry = await tx.queueEntry.findFirst({
        where: { liveSessionId: id, status: QueueStatus.QUEUED },
        orderBy: [{ priorityRank: "desc" }, { sortOrder: "asc" }],
      });

      if (nextEntry) {
        await tx.queueEntry.update({
          where: { id: nextEntry.id },
          data: {
            status: QueueStatus.PLAYING,
            loadedIntoPlayerAt: new Date(),
            originPriorityRank: nextEntry.priorityRank,
            originSortOrder: nextEntry.sortOrder,
          },
        });
        await tx.submission.update({
          where: { id: nextEntry.submissionId },
          data: { currentQueueStatus: QueueStatus.PLAYING },
        });
      }

      await tx.liveSession.update({
        where: { id, queueRevision: expectedQueueRevision },
        data: {
          queueRevision: { increment: 1 },
          currentQueueEntryId: nextEntry ? nextEntry.id : null,
        },
      });

      return { success: true };
    });
  }

  async loadQueueEntry(
    userId: string,
    id: string,
    entryId: string,
    expectedQueueRevision: number,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const lockedSessions = await tx.$queryRaw<any[]>`
        SELECT id, status, "hostId", "queueRevision", "currentQueueEntryId" FROM "live_sessions" WHERE id = ${id}::uuid FOR UPDATE
      `;

      if (!lockedSessions.length)
        throw new NotFoundException("Live session not found");
      const session = lockedSessions[0];

      if (session.hostId !== userId)
        throw new ForbiddenException("You do not own this live session");
      if (session.queueRevision !== expectedQueueRevision)
        throw new ConflictException("Stale queue revision");

      const entryToLoad = await tx.queueEntry.findUnique({
        where: { id: entryId },
      });

      if (
        !entryToLoad ||
        entryToLoad.liveSessionId !== id ||
        entryToLoad.status !== QueueStatus.QUEUED
      ) {
        throw new BadRequestException("Invalid entry to load");
      }

      if (session.currentQueueEntryId) {
        await this.qualifyAndDisplaceCurrentPlayer(
          tx,
          session.currentQueueEntryId,
          id,
        );
      }

      await tx.queueEntry.update({
        where: { id: entryId },
        data: {
          status: QueueStatus.PLAYING,
          loadedIntoPlayerAt: new Date(),
          originPriorityRank: entryToLoad.priorityRank,
          originSortOrder: entryToLoad.sortOrder,
        },
      });
      await tx.submission.update({
        where: { id: entryToLoad.submissionId },
        data: { currentQueueStatus: QueueStatus.PLAYING },
      });

      await tx.liveSession.update({
        where: { id, queueRevision: expectedQueueRevision },
        data: {
          queueRevision: { increment: 1 },
          currentQueueEntryId: entryToLoad.id,
        },
      });

      return { success: true };
    });
  }

  async clearPlayer(userId: string, id: string, expectedQueueRevision: number) {
    return this.prisma.$transaction(async (tx) => {
      const lockedSessions = await tx.$queryRaw<any[]>`
        SELECT id, status, "hostId", "queueRevision", "currentQueueEntryId" FROM "live_sessions" WHERE id = ${id}::uuid FOR UPDATE
      `;

      if (!lockedSessions.length)
        throw new NotFoundException("Live session not found");
      const session = lockedSessions[0];

      if (session.hostId !== userId)
        throw new ForbiddenException("You do not own this live session");
      if (session.queueRevision !== expectedQueueRevision)
        throw new ConflictException("Stale queue revision");

      if (session.currentQueueEntryId) {
        await this.qualifyAndDisplaceCurrentPlayer(
          tx,
          session.currentQueueEntryId,
          id,
        );
      } else {
        // Nothing to clear, no-op
        return { success: true };
      }

      await tx.liveSession.update({
        where: { id, queueRevision: expectedQueueRevision },
        data: {
          queueRevision: { increment: 1 },
          currentQueueEntryId: null,
        },
      });

      return { success: true };
    });
  }

  async moveToNext(
    userId: string,
    id: string,
    entryId: string,
    expectedQueueRevision: number,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const lockedSessions = await tx.$queryRaw<any[]>`
        SELECT id, status, "hostId", "queueRevision" FROM "live_sessions" WHERE id = ${id}::uuid FOR UPDATE
      `;

      if (!lockedSessions.length)
        throw new NotFoundException("Live session not found");
      const session = lockedSessions[0];

      if (session.hostId !== userId)
        throw new ForbiddenException("You do not own this live session");
      if (session.queueRevision !== expectedQueueRevision)
        throw new ConflictException("Stale queue revision");

      const entryToMove = await tx.queueEntry.findUnique({
        where: { id: entryId },
      });

      if (
        !entryToMove ||
        entryToMove.liveSessionId !== id ||
        entryToMove.status !== QueueStatus.QUEUED
      ) {
        throw new BadRequestException("Invalid entry to move");
      }

      const groupEntries = await tx.queueEntry.findMany({
        where: {
          liveSessionId: id,
          status: QueueStatus.QUEUED,
          priorityRank: entryToMove.priorityRank,
        },
        orderBy: { sortOrder: "asc" },
      });

      if (
        this.queueOrderingService.isNoOp(
          entryId,
          ReorderIntent.TOP,
          groupEntries,
        )
      ) {
        return { success: true }; // No-op, no revision increment
      }

      const { needsRebalance, midpoint } =
        this.queueOrderingService.calculateNewSortOrder(
          ReorderIntent.TOP,
          groupEntries,
        );

      if (needsRebalance) {
        // If rebalance is needed, we apply it to the group (excluding the moved entry to simulate TOP)
        const groupWithoutMoved = groupEntries.filter((e) => e.id !== entryId);
        // Prepend the moved entry to top
        const rebalanced = this.queueOrderingService.generateRebalanceUpdates([
          entryToMove,
          ...groupWithoutMoved,
        ]);

        for (const update of rebalanced) {
          await tx.queueEntry.update({
            where: { id: update.id },
            data: { sortOrder: update.sortOrder },
          });
        }
      } else {
        await tx.queueEntry.update({
          where: { id: entryId },
          data: { sortOrder: midpoint },
        });
      }

      await tx.liveSession.update({
        where: { id, queueRevision: expectedQueueRevision },
        data: { queueRevision: { increment: 1 } },
      });

      return { success: true };
    });
  }

  async changeEntryTier(
    userId: string,
    liveSessionId: string,
    entryId: string,
    dto: import("./dto/live-session.dto").HostManualTierChangeDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      // 1. Verify Host ownership
      const liveSession = await tx.liveSession.findUnique({
        where: { id: liveSessionId },
      });
      if (!liveSession || liveSession.hostId !== userId) {
        throw new ForbiddenException(
          "Not authorized to modify queue entries for this live session",
        );
      }

      // 2. Look up the entry
      const entry = await tx.queueEntry.findFirst({
        where: { id: entryId, liveSessionId },
        include: { submission: true },
      });

      if (!entry) {
        throw new NotFoundException("Queue entry not found");
      }

      const isCurrentlyFree = !entry.submission.isPriority;
      const isDestinationFree = dto.destinationType === "FREE";

      if (isCurrentlyFree && isDestinationFree) {
        return { success: true, message: "Already in FREE line" };
      }
      if (
        !isCurrentlyFree &&
        !isDestinationFree &&
        entry.submission.priorityTierSnapshotId === dto.tierSnapshotId
      ) {
        return { success: true, message: "Already in requested PRIORITY tier" };
      }

      let newPriorityRank = 0;
      let newSortOrder: any = entry.sortOrder;

      // Group entries for destination ordering
      const destinationEntries = await tx.queueEntry.findMany({
        where: {
          liveSessionId,
          priorityRank: isDestinationFree
            ? 0
            : (
                await tx.livePriorityTierSnapshot.findFirst({
                  where: { id: dto.tierSnapshotId, liveSessionId },
                })
              ).priorityRank,
          status: { in: ["QUEUED", "NEXT"] },
        },
        orderBy: { sortOrder: "asc" },
      });

      if (isDestinationFree) {
        newPriorityRank = 0;

        // Priority -> Free: Restore original free position if possible
        if (
          entry.tierOriginPriorityRank !== null &&
          entry.tierOriginSortOrder !== null
        ) {
          // Attempt to restore near origin
          newSortOrder = entry.tierOriginSortOrder;
        } else {
          // Never previously Free, go to bottom
          newSortOrder = this.queueOrderingService.calculateNewSortOrder(
            ReorderIntent.BOTTOM,
            destinationEntries as any,
          ).midpoint;
        }

        // Update entry and submission
        await tx.submission.update({
          where: { id: entry.submissionId },
          data: {
            isPriority: false,
            priorityTierSnapshotId: null,
          },
        });

        await tx.queueEntry.update({
          where: { id: entryId },
          data: {
            priorityRank: newPriorityRank,
            sortOrder: newSortOrder,
          },
        });
      } else {
        // Free/Priority -> New Priority Tier
        if (!dto.tierSnapshotId) {
          throw new BadRequestException(
            "tierSnapshotId is required for PRIORITY_TIER destination",
          );
        }

        const tierSnapshot = await tx.livePriorityTierSnapshot.findFirst({
          where: { id: dto.tierSnapshotId, liveSessionId },
        });

        if (!tierSnapshot) {
          throw new NotFoundException("Destination priority tier not found");
        }

        newPriorityRank = tierSnapshot.priorityRank;

        // If moving from Free -> Priority, save the Free origin
        let updateData: any = {
          priorityRank: newPriorityRank,
        };

        if (isCurrentlyFree) {
          if (
            entry.tierOriginPriorityRank === null &&
            entry.tierOriginSortOrder === null
          ) {
            updateData.tierOriginPriorityRank = entry.priorityRank;
            updateData.tierOriginSortOrder = entry.sortOrder;
          }
        }

        // Since we are changing tier, place at the bottom of the destination tier group
        updateData.sortOrder = this.queueOrderingService.calculateNewSortOrder(
          ReorderIntent.BOTTOM,
          destinationEntries as any,
        ).midpoint;

        await tx.submission.update({
          where: { id: entry.submissionId },
          data: {
            isPriority: true,
            priorityTierSnapshotId: tierSnapshot.id,
          },
        });

        await tx.queueEntry.update({
          where: { id: entryId },
          data: updateData,
        });
      }

      return { success: true };
    });
  }

  async updateConfiguration(
    userId: string,
    liveSessionId: string,
    dto: import("./dto/update-live-session-config.dto").UpdateLiveSessionConfigDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const liveSession = await tx.liveSession.findUnique({
        where: { id: liveSessionId },
      });
      if (!liveSession || liveSession.hostId !== userId) {
        throw new ForbiddenException(
          "Not authorized to configure this live session",
        );
      }

      // Update LiveSession properties
      const lsUpdateData: any = {};
      if (dto.submissionsOpen !== undefined)
        lsUpdateData.submissionsOpen = dto.submissionsOpen;
      if (dto.freeLineOpen !== undefined)
        lsUpdateData.freeLineOpen = dto.freeLineOpen;
      if (dto.paidSubmissionsOpen !== undefined)
        lsUpdateData.paidSubmissionsOpen = dto.paidSubmissionsOpen;

      if (Object.keys(lsUpdateData).length > 0) {
        await tx.liveSession.update({
          where: { id: liveSessionId },
          data: lsUpdateData,
        });
      }

      // Update FreeLineConfiguration
      if (dto.freeLine) {
        const currentFreeLine = await tx.freeLineConfiguration.findFirst({
          where: { liveSessionId },
          orderBy: { createdAt: "desc" },
        });
        if (currentFreeLine) {
          await tx.freeLineConfiguration.update({
            where: { id: currentFreeLine.id },
            data: {
              isEnabled:
                dto.freeLine.isEnabled !== undefined
                  ? dto.freeLine.isEnabled
                  : currentFreeLine.isEnabled,
              maxFreeSubmissionsPerUser:
                dto.freeLine.maxFreeSubmissionsPerUser !== undefined
                  ? dto.freeLine.maxFreeSubmissionsPerUser!
                  : currentFreeLine.maxFreeSubmissionsPerUser,
              totalFreeCapacityLimit:
                dto.freeLine.totalFreeCapacityLimit !== undefined
                  ? dto.freeLine.totalFreeCapacityLimit
                  : currentFreeLine.totalFreeCapacityLimit,
              activeEntryCapacityLimit:
                dto.freeLine.activeEntryCapacityLimit !== undefined
                  ? dto.freeLine.activeEntryCapacityLimit
                  : currentFreeLine.activeEntryCapacityLimit,
            },
          });
        }
      }

      // Update PriorityTiers
      if (dto.priorityTiers && dto.priorityTiers.length > 0) {
        for (const tierDto of dto.priorityTiers) {
          const currentTier = await tx.livePriorityTierSnapshot.findFirst({
            where: { id: tierDto.id, liveSessionId },
          });
          if (currentTier) {
            await tx.livePriorityTierSnapshot.update({
              where: { id: tierDto.id },
              data: {
                name:
                  tierDto.name !== undefined ? tierDto.name : currentTier.name,
                priceCents:
                  tierDto.priceCents !== undefined
                    ? tierDto.priceCents
                    : currentTier.priceCents,
                isActive:
                  tierDto.isActive !== undefined
                    ? tierDto.isActive
                    : currentTier.isActive,
                maxPurchasesPerUserPerLive:
                  tierDto.maxPurchasesPerUserPerLive !== undefined
                    ? tierDto.maxPurchasesPerUserPerLive
                    : currentTier.maxPurchasesPerUserPerLive,
              },
            });
          }
        }
      }

      return { success: true };
    });
  }
}
