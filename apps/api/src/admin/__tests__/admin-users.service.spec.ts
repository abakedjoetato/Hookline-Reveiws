import { describe, it, expect, vi, beforeEach } from "vitest";
import { AdminUsersService } from "../admin-users.service";
import { AccountStatus } from "@platform/types";

describe("AdminUsersService", () => {
  let service: AdminUsersService;

  const mockPrisma = {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    ban: {
      create: vi.fn(),
    },
    $transaction: vi.fn(cb => cb(mockPrisma)),
  };

  const mockQueueService = {
    enqueueDeleteUserMedia: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AdminUsersService(mockPrisma as any, mockQueueService as any);
  });

  describe("banUser", () => {
    it("should create ban, update user status, and enqueue cleanup", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: "user1" });

      const res = await service.banUser("user1", "admin1", "VIOLATION", "Internal", "Public");

      expect(res.success).toBe(true);
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: "user1" },
        data: { accountStatus: AccountStatus.BANNED }
      });
      expect(mockPrisma.ban.create).toHaveBeenCalled();
      expect(mockQueueService.enqueueDeleteUserMedia).toHaveBeenCalledWith({
        ownerUserId: "user1"
      });
    });
  });

  describe("deleteUser", () => {
    it("should soft delete user and enqueue cleanup", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: "user1" });

      const res = await service.deleteUser("user1");

      expect(res.success).toBe(true);
      expect(mockPrisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: "user1" },
        data: expect.objectContaining({ accountStatus: AccountStatus.DEACTIVATED })
      }));
      expect(mockQueueService.enqueueDeleteUserMedia).toHaveBeenCalledWith({
        ownerUserId: "user1"
      });
    });
  });
});
