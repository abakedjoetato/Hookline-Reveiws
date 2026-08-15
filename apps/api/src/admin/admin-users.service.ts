import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaClient, generateUuidV7 } from "@platform/database";
import { AccountStatus, BanScope } from "@platform/types";
import { MediaProcessingQueueService } from "../tracks/media-processing-queue.service";

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly mediaProcessingQueue: MediaProcessingQueueService,
  ) {}

  async banUser(
    targetUserId: string,
    adminUserId: string,
    reasonCode: string,
    internalReason: string,
    userVisibleReason: string,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: targetUserId },
    });
    if (!user) throw new NotFoundException("User not found");

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: targetUserId },
        data: { accountStatus: AccountStatus.BANNED },
      });

      await tx.ban.create({
        data: {
          id: generateUuidV7(),
          targetUserId,
          scope: BanScope.FULL_PLATFORM,
          reasonCode,
          internalReason,
          userVisibleReason,
          isPermanent: true,
          isActive: true,
          creatingAdminUserId: adminUserId,
        },
      });

      // Optionally revoke sessions here
    });

    // Enqueue storage cleanup
    await this.mediaProcessingQueue.enqueueDeleteUserMedia({
      ownerUserId: targetUserId,
    });

    return { success: true };
  }

  async deleteUser(targetUserId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: targetUserId },
    });
    if (!user) throw new NotFoundException("User not found");

    // Soft delete user record and enqueue storage cleanup
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: targetUserId },
        data: {
          accountStatus: AccountStatus.DEACTIVATED, // Or a specific deleted state
          deletedAt: new Date(),
        },
      });
    });

    // Enqueue storage cleanup
    await this.mediaProcessingQueue.enqueueDeleteUserMedia({
      ownerUserId: targetUserId,
    });

    return { success: true };
  }
}
