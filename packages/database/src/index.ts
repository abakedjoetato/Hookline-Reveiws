import { PrismaClient } from '@prisma/client';
import { uuidv7 } from 'uuidv7';

// Export Prisma Client types and enums
export * from '@prisma/client';

// Centralized UUIDv7 generator
export function generateUuidV7(): string {
  return uuidv7();
}

// Global PrismaClient instance
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// Database connectivity and health check helper
export async function testDbConnection(): Promise<boolean> {
  try {
    // We execute a simple query to verify postgres availability
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    console.error('❌ Database connectivity check failed:', error);
    return false;
  }
}
