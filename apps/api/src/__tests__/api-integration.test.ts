import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, VersioningType } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../app.module';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

// 1. Mock Database Connectivity Helper so tests run completely offline and isolated
vi.mock('@platform/database', () => {
  return {
    testDbConnection: vi.fn().mockResolvedValue(true),
  };
});

// 2. Mock ioredis completely to prevent attempting local socket connections during integration testing
vi.mock('ioredis', () => {
  return {
    default: vi.fn().mockImplementation(() => {
      return {
        ping: vi.fn().mockResolvedValue('PONG'),
        disconnect: vi.fn(),
      };
    }),
  };
});

describe('TheQueue Backend API Integration Tests', () => {
  let app: INestApplication;

  beforeAll(async () => {
    // Suppress verbose logging during tests
    process.env.LOG_LEVEL = 'error';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Register simple request ID middleware for testing liveness probes
    app.use((req: any, _res: any, next: () => void) => {
      req.requestId = 'test-request-id';
      next();
    });

    // Wire up prefix and versioning to match main application setup exactly
    app.setGlobalPrefix('api');
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: '1',
    });

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/v1/health', () => {
    it('should return 200 with active liveness status indicators', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/health')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'UP');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('requestId');
    });
  });

  describe('GET /api/v1/readiness', () => {
    it('should return 200 and report UP status for all dependencies when healthy', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/readiness')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'UP');
      expect(response.body.services).toEqual({
        database: 'UP',
        redis: 'UP',
        storage: 'UP', // Resolves to UP under development/test environments
      });
    });
  });
});
