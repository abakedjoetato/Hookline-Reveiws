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
} from "./dto/live-session.dto";

@Injectable()
export class LiveSessionsService {
  constructor(private readonly prisma: PrismaClient) {}

  async createLiveSession(userId: string, dto: CreateLiveSessionDto): Promise<import("./dto/live-session.dto").SafeLiveSessionResponse> {
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
      return { id: created.id, stationId: created.stationId, status: created.status, liveTitle: created.liveTitle, queueRevision: created.queueRevision };
    });
  }

  async getLiveSession(userId: string, id: string): Promise<import("./dto/live-session.dto").SafeLiveSessionResponse> {
    const session = await this.prisma.liveSession.findUnique({
      where: { id },
    });

    if (!session) {
      throw new NotFoundException("Live session not found");
    }

    if (session.hostId !== userId) {
      throw new ForbiddenException("You do not own this live session");
    }

    return { id: session.id, stationId: session.stationId, status: session.status, liveTitle: session.liveTitle, queueRevision: session.queueRevision };
  }

  async startLiveSession(userId: string, id: string, expectedQueueRevision: number): Promise<import("./dto/live-session.dto").SafeLiveSessionResponse> {
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
        throw new BadRequestException("Invalid lifecycle transition. Session must be in PREPARING state to start.");
      }

      const updated = await tx.liveSession.update({
        where: { id, queueRevision: expectedQueueRevision },
        data: {
          status: LiveSessionStatus.LIVE,
          startedAt: new Date(),
          queueRevision: { increment: 1 },
        },
      });
      return { id: updated.id, stationId: updated.stationId, status: updated.status, liveTitle: updated.liveTitle, queueRevision: updated.queueRevision };
    });
  }

  async pauseLiveSession(userId: string, id: string, expectedQueueRevision: number): Promise<import("./dto/live-session.dto").SafeLiveSessionResponse> {
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
        throw new BadRequestException("Invalid lifecycle transition. Session must be in LIVE state to pause.");
      }

      const updated = await tx.liveSession.update({
        where: { id, queueRevision: expectedQueueRevision },
        data: {
          status: LiveSessionStatus.PAUSED,
          queueRevision: { increment: 1 },
        },
      });
      return { id: updated.id, stationId: updated.stationId, status: updated.status, liveTitle: updated.liveTitle, queueRevision: updated.queueRevision };
    });
  }

  async resumeLiveSession(userId: string, id: string, expectedQueueRevision: number): Promise<import("./dto/live-session.dto").SafeLiveSessionResponse> {
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
        throw new BadRequestException("Invalid lifecycle transition. Session must be in PAUSED state to resume.");
      }

      const updated = await tx.liveSession.update({
        where: { id, queueRevision: expectedQueueRevision },
        data: {
          status: LiveSessionStatus.LIVE,
          queueRevision: { increment: 1 },
        },
      });
      return { id: updated.id, stationId: updated.stationId, status: updated.status, liveTitle: updated.liveTitle, queueRevision: updated.queueRevision };
    });
  }

  async endLiveSession(userId: string, id: string, expectedQueueRevision: number): Promise<import("./dto/live-session.dto").SafeLiveSessionResponse> {
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

      if (![LiveSessionStatus.PREPARING, LiveSessionStatus.LIVE, LiveSessionStatus.PAUSED].includes(session.status)) {
        throw new BadRequestException("Invalid lifecycle transition. Session cannot be ended from its current state.");
      }

      const updated = await tx.liveSession.update({
        where: { id, queueRevision: expectedQueueRevision },
        data: {
          status: LiveSessionStatus.ENDED,
          endedAt: new Date(),
          queueRevision: { increment: 1 },
        },
      });
      return { id: updated.id, stationId: updated.stationId, status: updated.status, liveTitle: updated.liveTitle, queueRevision: updated.queueRevision };
    });
  }

  async addQueueEntry(userId: string, id: string, dto: AddQueueEntryDto): Promise<import("./dto/live-session.dto").SafeQueueEntryResponse> {
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
        where: { id: dto.submissionId }
      });

      if (!submission || submission.liveSessionId !== id) {
        throw new BadRequestException("Invalid submission");
      }

      // Check if entry already exists for this submission
      const existingEntry = await tx.queueEntry.findUnique({
        where: { submissionId: dto.submissionId },
      });

      if (existingEntry) {
        throw new ConflictException("Queue entry already exists for this submission");
      }

      // Determine initial deterministic sort order (simple stable spacing strategy)
      const lastEntry = await tx.queueEntry.findFirst({
        where: { liveSessionId: id },
        orderBy: { sortOrder: 'desc' },
      });

      const nextSortOrder = lastEntry ? Number(lastEntry.sortOrder) + 1000 : 1000;

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
        }
      };
    });
  }

  async getQueue(userId: string, id: string): Promise<import("./dto/live-session.dto").SafeQueueEntryResponse[]> {
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
        { priorityRank: 'desc' },
        { sortOrder: 'asc' },
      ],
      include: {
        submission: true,
      }
    });

    return entries.map(entry => ({
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
      }
    }));
  }
}
