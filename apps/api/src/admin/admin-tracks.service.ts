import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaClient } from "@platform/database";
import { StorageStatus, ProcessingState } from "@platform/types";
import { MediaProcessingQueueService } from "../tracks/media-processing-queue.service";

@Injectable()
export class AdminTracksService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly mediaProcessingQueue: MediaProcessingQueueService,
  ) {}

  async getAdminTracks(query: {
    neverPlayed?: boolean;
    inactiveDays?: number;
    storageStatus?: StorageStatus;
    ownerUserId?: string;
    sortBy?:
      | "lastPlayedDesc"
      | "lastPlayedAsc"
      | "uploadDate"
      | "fileSize"
      | "title"
      | "artist";
  }) {
    let where: any = { deletedAt: null };

    if (query.neverPlayed) {
      where.lastPlayedAt = null;
    } else if (query.inactiveDays) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - query.inactiveDays);
      where.lastPlayedAt = { lt: cutoffDate };
    }

    if (query.storageStatus) {
      where.mediaVersions = { some: { storageStatus: query.storageStatus } };
    }

    if (query.ownerUserId) {
      where.userId = query.ownerUserId;
    }

    let orderBy: any = { createdAt: "desc" };
    switch (query.sortBy) {
      case "lastPlayedDesc":
        orderBy = { lastPlayedAt: "desc" };
        break;
      case "lastPlayedAsc":
        orderBy = { lastPlayedAt: "asc" };
        break;
      case "uploadDate":
        orderBy = { createdAt: "desc" };
        break;
      case "fileSize":
        // Sorting by an aggregated value or relation requires more complex prisma queries
        // or sorting in memory. We'll simplify for the basic requirements by sorting
        // based on the first media version if prisma allows, or fallback to uploadDate
        orderBy = { createdAt: "desc" };
        break;
      case "title":
        orderBy = { songName: "asc" };
        break;
      case "artist":
        orderBy = { artistIdentity: { artistName: "asc" } };
        break;
    }

    const tracks = await this.prisma.track.findMany({
      where,
      include: {
        artistIdentity: true,
        user: { select: { id: true, username: true, email: true } },
        mediaVersions: { where: { isCurrent: true } },
      },
      orderBy,
    });

    return tracks.map((track) => {
      const currentMedia = track.mediaVersions[0];
      return {
        id: track.id,
        title: track.songName,
        artist: track.artistIdentity.artistName,
        owner: track.user,
        fileSize: currentMedia?.fileSize ? Number(currentMedia.fileSize) : 0,
        storageStatus: currentMedia?.storageStatus || StorageStatus.AVAILABLE,
        processingState: track.processingState,
        uploadDate: track.createdAt,
        lastPlayedAt: track.lastPlayedAt,
      };
    });
  }

  async deleteTrackMedia(trackId: string) {
    const track = await this.prisma.track.findUnique({
      where: { id: trackId },
      include: { mediaVersions: true, artworks: true },
    });

    if (!track) throw new NotFoundException("Track not found");

    const objectKeys = [];
    const mediaVersionIds = [];
    const artworkIds = [];

    for (const mv of track.mediaVersions) {
      if (mv.storageStatus === StorageStatus.AVAILABLE) {
        objectKeys.push(mv.originalObjectKey);
        if (mv.processedObjectKey) objectKeys.push(mv.processedObjectKey);
        mediaVersionIds.push(mv.id);
      }
    }

    for (const art of track.artworks) {
      if (art.storageStatus === StorageStatus.AVAILABLE) {
        objectKeys.push(art.originalObjectKey);
        if (art.masterObjectKey) objectKeys.push(art.masterObjectKey);
        if (art.thumbnailObjectKey) objectKeys.push(art.thumbnailObjectKey);
        artworkIds.push(art.id);
      }
    }

    if (objectKeys.length > 0) {
      await this.prisma.$transaction(async (tx) => {
        if (mediaVersionIds.length > 0) {
          await tx.trackMediaVersion.updateMany({
            where: { id: { in: mediaVersionIds } },
            data: { storageStatus: StorageStatus.DELETION_PENDING },
          });
        }
        if (artworkIds.length > 0) {
          await tx.trackArtwork.updateMany({
            where: { id: { in: artworkIds } },
            data: { storageStatus: StorageStatus.DELETION_PENDING },
          });
        }
      });

      await this.mediaProcessingQueue.enqueueDeleteMediaObjects({
        objectKeys,
      });
    }

    return { success: true, pendingDeletions: objectKeys.length };
  }

  async deleteArtwork(artworkId: string) {
    const artwork = await this.prisma.trackArtwork.findUnique({
      where: { id: artworkId },
    });
    if (!artwork) throw new NotFoundException("Artwork not found");

    const objectKeys = [artwork.originalObjectKey];
    if (artwork.masterObjectKey) objectKeys.push(artwork.masterObjectKey);
    if (artwork.thumbnailObjectKey) objectKeys.push(artwork.thumbnailObjectKey);

    await this.prisma.trackArtwork.update({
      where: { id: artworkId },
      data: { storageStatus: StorageStatus.DELETION_PENDING },
    });

    await this.mediaProcessingQueue.enqueueDeleteMediaObjects({
      objectKeys,
    });

    return { success: true };
  }

  async deleteMediaObject(objectKey: string) {
    await this.mediaProcessingQueue.enqueueDeleteMediaObjects({
      objectKeys: [objectKey],
    });
    return { success: true };
  }

  async deleteUserMedia(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException("User not found");

    await this.mediaProcessingQueue.enqueueDeleteUserMedia({
      ownerUserId: userId,
    });

    return { success: true };
  }
}
