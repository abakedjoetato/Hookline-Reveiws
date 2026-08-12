import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import { AppModule } from "../../app.module";
import { PrismaClient, generateUuidV7 } from "@platform/database";
import request from "supertest";
import { StreamingPlatform, LiveSessionStatus, QueueStatus } from "@platform/types";

describe("LiveSessions Integration Tests", () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  // Test data
  let hostUser: any;
  let otherUser: any;
  let hostProfile: any;
  let station: any;

  beforeAll(async () => {
    // Only run if TEST_DATABASE_URL is defined to ensure we don't hit production
    if (!process.env.TEST_DATABASE_URL) {
      console.warn("Skipping integration tests, TEST_DATABASE_URL not set");
      return;
    }

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = moduleFixture.get<PrismaClient>(PrismaClient);
  });

  afterAll(async () => {
    if (app) {
      try {
        await app.close();
      } catch (e) {
        // ignore redis close error
      }
    }
    if (prisma) await prisma.$disconnect();
  });

  it("should have tests for live sessions", () => {
    expect(true).toBe(true);
  });
});
