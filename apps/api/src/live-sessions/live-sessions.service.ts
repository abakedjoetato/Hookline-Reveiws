import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaClient, generateUuidV7 } from "@platform/database";
import { LiveSessionStatus, QueueStatus } from "@platform/types";
import {
  CreateLiveSessionDto,
  AddQueueEntryDto,
  ReorderQueueEntryDto,
  ReorderIntent,
} from "./dto/live-session.dto";
import { QueueOrderingService } from "./queue-ordering.service";
import { Decimal } from "decimal.js";

@Injectable()
export class LiveSessionsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly queueOrdering: QueueOrderingService,
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

      const priorityRank = submission.isPriority ? 1 : 0;

      // Determine initial deterministic sort order (simple stable spacing strategy)
      // Must be at the bottom of its OWN priority group
      const lastEntry = await tx.queueEntry.findFirst({
        where: {
          liveSessionId: id,
          status: QueueStatus.QUEUED,
          priorityRank: priorityRank,
        },
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
          priorityRank, // Simplified for this foundational slice
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

  async reorderQueueEntry(
    userId: string,
    sessionId: string,
    entryId: string,
    dto: ReorderQueueEntryDto,
  ): Promise<void> {
    return this.prisma.$transaction(async (tx) => {
      // 1. Lock the session row to prevent concurrent mutations
      const lockedSessions = await tx.$queryRaw<any[]>`
        SELECT id, "hostId", "queueRevision" FROM "live_sessions" WHERE id = ${sessionId}::uuid FOR UPDATE
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

      // Load the moved entry
      const movedEntry = await tx.queueEntry.findUnique({
        where: { id: entryId },
      });

      if (
        !movedEntry ||
        movedEntry.liveSessionId !== sessionId ||
        movedEntry.status !== QueueStatus.QUEUED
      ) {
        throw new BadRequestException("Invalid queue entry");
      }

      // Load target entry if provided
      let targetEntry = null;
      if (dto.targetEntryId) {
        targetEntry = await tx.queueEntry.findUnique({
          where: { id: dto.targetEntryId },
        });

        if (
          !targetEntry ||
          targetEntry.liveSessionId !== sessionId ||
          targetEntry.status !== QueueStatus.QUEUED
        ) {
          throw new BadRequestException("Invalid target entry");
        }
      }

      // Calculate clamping based on cross-priority logic
      const clampResult = this.queueOrdering.clampIntent(
        movedEntry,
        targetEntry,
        dto.intent,
      );
      const activeIntent = clampResult.intent;
      const activeTargetId = clampResult.clamped
        ? undefined
        : dto.targetEntryId;

      // Load affected priority group (all QUEUED entries in the same priority rank)
      const groupEntries = await tx.queueEntry.findMany({
        where: {
          liveSessionId: sessionId,
          priorityRank: movedEntry.priorityRank,
          status: QueueStatus.QUEUED,
        },
        orderBy: [
          { sortOrder: "asc" },
          { createdAt: "asc" }, // deterministic fallback
          { id: "asc" },
        ],
      });

      // Detect no-op
      if (
        this.queueOrdering.isNoOp(
          entryId,
          activeIntent,
          groupEntries,
          activeTargetId,
        )
      ) {
        return; // Return current authoritative state without incrementing queueRevision
      }

      // Remove movedEntry from the list to simulate insertion into the "remaining" list
      const listWithoutMoved = groupEntries.filter((e) => e.id !== entryId);

      const orderResult = this.queueOrdering.calculateNewSortOrder(
        activeIntent,
        listWithoutMoved,
        activeTargetId,
      );

      let finalSortOrder = orderResult.midpoint;

      if (orderResult.needsRebalance) {
        // We must rebalance this priority group
        const cleanUpdates =
          this.queueOrdering.generateRebalanceUpdates(listWithoutMoved);

        // Execute the rebalance
        for (const update of cleanUpdates) {
          await tx.queueEntry.update({
            where: { id: update.id },
            data: { sortOrder: update.sortOrder },
          });
        }

        // Now that it's clean, recalculate the requested position
        // We need to construct the new clean list to calculate
        const cleanGroupEntries = listWithoutMoved.map((e, index) => ({
          ...e,
          sortOrder: cleanUpdates[index].sortOrder,
        }));

        const cleanOrderResult = this.queueOrdering.calculateNewSortOrder(
          activeIntent,
          cleanGroupEntries,
          activeTargetId,
        );

        if (cleanOrderResult.needsRebalance || !cleanOrderResult.midpoint) {
          throw new Error("Rebalance failed to resolve precision exhaustion");
        }

        finalSortOrder = cleanOrderResult.midpoint;
      }

      // Update the moved entry
      await tx.queueEntry.update({
        where: { id: entryId },
        data: { sortOrder: finalSortOrder },
      });

      // Update queue revision
      await tx.liveSession.update({
        where: { id: sessionId, queueRevision: dto.expectedQueueRevision },
        data: { queueRevision: { increment: 1 } },
      });
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
      orderBy: [
        { priorityRank: "desc" },
        { sortOrder: "asc" },
        { createdAt: "asc" },
        { id: "asc" },
      ],
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
}
