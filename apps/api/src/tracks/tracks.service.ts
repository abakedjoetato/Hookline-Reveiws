import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Inject,
} from "@nestjs/common";
import { TrackRepository } from "./track.repository";
import { TrackMediaRepository } from "./track-media.repository";
import { TrackArtworkRepository } from "./track-artwork.repository";
import { StorageService, STORAGE_SERVICE } from "../storage/storage.interface";
import { PrismaClient, generateUuidV7 } from "@platform/database";
import {
  CreateTrackUploadUrlDto,
  UpdateTrackDto,
  ReplaceTrackAudioUrlDto,
  CreateArtworkUploadUrlDto,
} from "./dto/track.dto";
import {
  ProcessingState,
  UploadIntentType,
  UploadIntentStatus,
} from "@platform/types";
import { MediaProcessingQueueService } from "./media-processing-queue.service";
import { UploadIntentRepository } from "./intents/upload-intent.repository";

const ALLOWED_AUDIO_MIME_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/flac",
  "audio/x-flac",
  "audio/aac",
  "audio/mp4",
  "audio/x-m4a",
  "audio/m4a",
  "audio/ogg",
  "audio/webm",
]);

@Injectable()
export class TracksService {
  constructor(
    private readonly trackRepo: TrackRepository,
    private readonly mediaRepo: TrackMediaRepository,
    private readonly artworkRepo: TrackArtworkRepository,
    private readonly intentRepo: UploadIntentRepository,
    @Inject(STORAGE_SERVICE) private readonly storageService: StorageService,
    private readonly mediaProcessingQueue: MediaProcessingQueueService,
    private readonly prisma: PrismaClient,
  ) {}

  private async getOrCreateArtistIdentity(
    userId: string,
    artistName: string,
  ): Promise<string> {
    const normalized = artistName.toLowerCase().trim();
    let identity = await this.prisma.artistIdentity.findFirst({
      where: { userId, normalizedArtistName: normalized, deletedAt: null },
    });

    if (!identity) {
      identity = await this.prisma.artistIdentity.create({
        data: {
          id: generateUuidV7(),
          userId,
          artistName,
          normalizedArtistName: normalized,
        },
      });
    }
    return identity.id;
  }

  private uploadLimitBytes(): number {
    const mb = parseInt(process.env.GLOBAL_UPLOAD_LIMIT_MB || "50", 10);
    return (Number.isFinite(mb) && mb > 0 ? mb : 50) * 1024 * 1024;
  }

  async createUploadUrl(userId: string, dto: CreateTrackUploadUrlDto) {
    if (dto.fileSize > this.uploadLimitBytes()) {
      throw new BadRequestException("File size exceeds limit.");
    }
    if (!ALLOWED_AUDIO_MIME_TYPES.has(dto.mimeType.toLowerCase())) {
      throw new BadRequestException(
        "Unsupported audio format. Upload MP3, WAV, FLAC, AAC/M4A or OGG.",
      );
    }

    const artistIdentityId = await this.getOrCreateArtistIdentity(
      userId,
      dto.artistName,
    );

    const track = await this.trackRepo.create({
      userId,
      artistIdentityId,
      songName: dto.songName,
      albumName: dto.albumName,
      explicitContent: dto.explicitContent,
      bpm: dto.bpm,
      musicalKey: dto.musicalKey,
    });

    const presigned = await this.storageService.createPresignedUpload(
      "tracks/audio",
      dto.originalFilename,
      dto.mimeType,
      3600,
    );

    const intent = await this.intentRepo.create({
      userId,
      trackId: track.id,
      type: UploadIntentType.TRACK_AUDIO,
      objectKey: presigned.objectKey,
      mimeType: dto.mimeType,
      originalFilename: dto.originalFilename,
      fileSize: dto.fileSize,
      expiresInSeconds: 3600,
    });

    return {
      trackId: track.id,
      uploadIntentId: intent.id,
      uploadUrl: presigned.url,
      expiresAt: presigned.expiresAt,
    };
  }

  async completeUpload(
    userId: string,
    trackId: string,
    uploadIntentId: string,
  ) {
    const intent = await this.intentRepo.findById(uploadIntentId);

    if (
      !intent ||
      intent.userId !== userId ||
      intent.trackId !== trackId ||
      intent.type !== UploadIntentType.TRACK_AUDIO
    ) {
      throw new NotFoundException("Upload intent not found or invalid");
    }

    if (
      intent.status !== UploadIntentStatus.PENDING ||
      intent.expiresAt < new Date()
    ) {
      throw new BadRequestException(
        "Upload intent is expired or already processed",
      );
    }

    const track = await this.trackRepo.findById(trackId);
    if (!track || track.userId !== userId) {
      throw new NotFoundException("Track not found");
    }

    // The presigned PUT can't enforce size, so check what actually landed
    const head = await this.storageService.headObject(intent.objectKey);
    const exists = Boolean(head);
    if (head && head.contentLength > this.uploadLimitBytes()) {
      await this.storageService.deleteObject(intent.objectKey).catch(() => undefined);
      await this.intentRepo.updateStatus(intent.id, UploadIntentStatus.FAILED);
      await this.trackRepo.update(trackId, { processingState: ProcessingState.FAILED });
      throw new BadRequestException("Uploaded file exceeds the size limit");
    }
    if (!exists) {
      await this.intentRepo.updateStatus(intent.id, UploadIntentStatus.FAILED);
      await this.trackRepo.update(trackId, {
        processingState: ProcessingState.FAILED,
      });
      throw new BadRequestException("Upload object not found in storage");
    }

    const currentMedia = await this.mediaRepo.findCurrentByTrackId(trackId);
    const newVersionNumber = currentMedia ? currentMedia.versionNumber + 1 : 1;

    const media = await this.mediaRepo.create({
      trackId: track.id,
      originalObjectKey: intent.objectKey,
      mimeType: intent.mimeType,
      originalFilename: intent.originalFilename,
      fileSize: intent.fileSize ? Number(intent.fileSize) : 0,
      versionNumber: newVersionNumber,
      isCurrent: newVersionNumber === 1 ? true : false,
    });

    await this.intentRepo.updateStatus(
      intent.id,
      UploadIntentStatus.PROCESSING,
    );

    // Only update track state to processing if this is the first version
    if (newVersionNumber === 1) {
      await this.mediaRepo.updateState(media.id, ProcessingState.PROCESSING);
      await this.trackRepo.update(trackId, {
        processingState: ProcessingState.PROCESSING,
      });
    }

    // Enqueue job for metadata extraction and analysis
    await this.mediaProcessingQueue.enqueueExtractAudioMetadata({
      trackId: track.id,
      mediaVersionId: media.id,
      ownerUserId: userId,
      objectKey: intent.objectKey,
    });

    return { success: true };
  }

  private mapTrackResponse(track: any) {
    // Ensure we do not leak internal storage paths
    if (track.mediaVersions) {
      track.mediaVersions = track.mediaVersions.map((mv: any) => {
        const { originalObjectKey, processedObjectKey, ...safeVersion } = mv;
        return safeVersion;
      });
    }
    if (track.artworks) {
      track.artworks = track.artworks.map((art: any) => {
        const {
          originalObjectKey,
          masterObjectKey,
          thumbnailObjectKey,
          ...safeArtwork
        } = art;
        return safeArtwork;
      });
    }
    return track;
  }

  async getTracks(userId: string) {
    const tracks = await this.trackRepo.findManyByUserId(userId);
    return tracks.map((t) => this.mapTrackResponse(t));
  }

  async searchTracks(userId: string, query: string) {
    const tracks = await this.trackRepo.search(userId, query);
    return tracks.map((t) => this.mapTrackResponse(t));
  }

  async getTrack(userId: string, trackId: string) {
    const track = await this.trackRepo.findById(trackId);
    if (!track || track.userId !== userId || track.deletedAt) {
      throw new NotFoundException("Track not found");
    }
    return this.mapTrackResponse(track);
  }

  async updateTrack(userId: string, trackId: string, dto: UpdateTrackDto) {
    const track = await this.trackRepo.findById(trackId);
    if (!track || track.userId !== userId || track.deletedAt) {
      throw new NotFoundException("Track not found");
    }

    let dataToUpdate: any = { ...dto };
    delete dataToUpdate.artistName;

    if (dto.artistName) {
      const artistIdentityId = await this.getOrCreateArtistIdentity(
        userId,
        dto.artistName,
      );
      dataToUpdate.artistIdentityId = artistIdentityId;
    }

    return this.trackRepo.update(trackId, dataToUpdate);
  }

  async deleteTrack(userId: string, trackId: string) {
    const track = await this.trackRepo.findById(trackId);
    if (!track || track.userId !== userId) {
      throw new NotFoundException("Track not found");
    }
    await this.trackRepo.softDelete(trackId);
    return { success: true };
  }

  async createReplaceAudioUrl(
    userId: string,
    trackId: string,
    dto: ReplaceTrackAudioUrlDto,
  ) {
    const track = await this.trackRepo.findById(trackId);
    if (!track || track.userId !== userId || track.deletedAt) {
      throw new NotFoundException("Track not found");
    }

    const presigned = await this.storageService.createPresignedUpload(
      "tracks/audio",
      dto.originalFilename,
      dto.mimeType,
      3600,
    );

    const intent = await this.intentRepo.create({
      userId,
      trackId: track.id,
      type: UploadIntentType.TRACK_AUDIO,
      objectKey: presigned.objectKey,
      mimeType: dto.mimeType,
      originalFilename: dto.originalFilename,
      fileSize: dto.fileSize,
      expiresInSeconds: 3600,
    });

    return {
      uploadIntentId: intent.id,
      uploadUrl: presigned.url,
      expiresAt: presigned.expiresAt,
    };
  }

  async createArtworkUploadUrl(
    userId: string,
    trackId: string,
    dto: CreateArtworkUploadUrlDto,
  ) {
    const track = await this.trackRepo.findById(trackId);
    if (!track || track.userId !== userId || track.deletedAt) {
      throw new NotFoundException("Track not found");
    }

    const presigned = await this.storageService.createPresignedUpload(
      "tracks/artwork",
      dto.originalFilename,
      dto.mimeType,
      3600,
    );

    const intent = await this.intentRepo.create({
      userId,
      trackId: track.id,
      type: UploadIntentType.TRACK_ARTWORK,
      objectKey: presigned.objectKey,
      mimeType: dto.mimeType,
      originalFilename: dto.originalFilename,
      fileSize: dto.fileSize,
      expiresInSeconds: 3600,
    });

    return {
      artworkUploadIntentId: intent.id,
      uploadUrl: presigned.url,
      expiresAt: presigned.expiresAt,
    };
  }

  async createDownloadUrl(userId: string, trackId: string, versionId?: string) {
    const track = await this.trackRepo.findById(trackId);
    if (!track || track.userId !== userId || track.deletedAt) {
      throw new NotFoundException("Track not found");
    }

    let media = undefined;
    if (versionId) {
      media = track.mediaVersions.find((m) => m.id === versionId);
    } else {
      media = track.mediaVersions.find((m) => m.isCurrent);
    }

    if (!media || media.processingState !== ProcessingState.READY) {
      throw new BadRequestException("Track media is not ready for download");
    }

    const url = await this.storageService.createPresignedDownload(
      media.originalObjectKey,
      3600,
    );
    return { url };
  }

  async completeArtworkUpload(
    userId: string,
    trackId: string,
    artworkUploadIntentId: string,
  ) {
    const intent = await this.intentRepo.findById(artworkUploadIntentId);

    if (
      !intent ||
      intent.userId !== userId ||
      intent.trackId !== trackId ||
      intent.type !== UploadIntentType.TRACK_ARTWORK
    ) {
      throw new NotFoundException("Upload intent not found or invalid");
    }

    if (
      intent.status !== UploadIntentStatus.PENDING ||
      intent.expiresAt < new Date()
    ) {
      throw new BadRequestException(
        "Upload intent is expired or already processed",
      );
    }

    const track = await this.trackRepo.findById(trackId);
    if (!track || track.userId !== userId || track.deletedAt) {
      throw new NotFoundException("Track not found");
    }

    // The presigned PUT can't enforce size, so check what actually landed
    const head = await this.storageService.headObject(intent.objectKey);
    const exists = Boolean(head);
    if (head && head.contentLength > this.uploadLimitBytes()) {
      await this.storageService.deleteObject(intent.objectKey).catch(() => undefined);
      await this.intentRepo.updateStatus(intent.id, UploadIntentStatus.FAILED);
      await this.trackRepo.update(trackId, { processingState: ProcessingState.FAILED });
      throw new BadRequestException("Uploaded file exceeds the size limit");
    }
    if (!exists) {
      await this.intentRepo.updateStatus(intent.id, UploadIntentStatus.FAILED);
      throw new BadRequestException("Upload object not found in storage");
    }

    const artwork = await this.artworkRepo.create({
      trackId,
      originalObjectKey: intent.objectKey,
      mimeType: intent.mimeType,
    });

    await this.intentRepo.updateStatus(
      intent.id,
      UploadIntentStatus.PROCESSING,
    );

    // Enqueue a job to process the artwork (generate thumbnails)
    await this.mediaProcessingQueue.enqueueProcessArtwork({
      trackId,
      artworkId: artwork.id,
      ownerUserId: userId,
      objectKey: intent.objectKey,
    });

    return { success: true };
  }
}
