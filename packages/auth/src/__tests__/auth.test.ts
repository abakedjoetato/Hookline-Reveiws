import { describe, it, expect } from 'vitest';
import { UserRole, AccountStatus } from '@platform/types';
import {
  isUserAdmin,
  isUserHost,
  isUserActive,
  generateSecureToken,
  hashToken,
  hashPassword,
  verifyPassword,
  AuthenticatedUser
} from '../index';

describe('Authentication & Authorization Abstraction', () => {
  const activeUser: AuthenticatedUser = {
    id: '0190fd2c-2c90-7d12-bf9e-bfbc36b21590',
    email: 'user@thequeue.com',
    username: 'user_active',
    isHost: false,
    isAdmin: false,
    accountStatus: AccountStatus.ACTIVE,
    emailVerified: true,
  };

  const activeHost: AuthenticatedUser = {
    ...activeUser,
    username: 'host_active',
    isHost: true,
    displayName: 'Stream Host',
  };

  const activeAdmin: AuthenticatedUser = {
    ...activeUser,
    username: 'admin_active',
    isAdmin: true,
    displayName: 'Administrator',
  };

  const suspendedUser: AuthenticatedUser = {
    ...activeUser,
    accountStatus: AccountStatus.SUSPENDED,
  };

  describe('Role-checking helpers', () => {
    it('should correctly identify active administrators', () => {
      expect(isUserAdmin(activeAdmin)).toBe(true);
      expect(isUserAdmin(activeUser)).toBe(false);
      expect(isUserAdmin(activeHost)).toBe(false);
      expect(isUserAdmin(suspendedUser)).toBe(false);
    });

    it('should correctly identify active hosts', () => {
      expect(isUserHost(activeHost)).toBe(true);
      expect(isUserHost(activeAdmin)).toBe(true); // Admin overrides host
      expect(isUserHost(activeUser)).toBe(false);
      expect(isUserHost(suspendedUser)).toBe(false);
    });

    it('should correctly assert status', () => {
      expect(isUserActive(activeUser)).toBe(true);
      expect(isUserActive(suspendedUser)).toBe(false);
    });
  });

  describe('Secure Cryptographic Tokens', () => {
    it('should generate secure non-UUID random hex tokens', () => {
      const token = generateSecureToken();
      expect(token).toHaveLength(64); // 32 bytes in hex = 64 characters
      // Ensure it is not a UUID
      expect(token).not.toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it('should generate distinct sha256 hashes of secure tokens', () => {
      const token = 'my_secret_token';
      const hash = hashToken(token);
      expect(hash).toHaveLength(64);
      expect(hash).toBe('ddd26ab8c5140fb0dc5bd8cdccd6a0102d09c9bdf2466a5cd718373fd42a17b1');
    });
  });

  describe('Argon2id Password Hashing', () => {
    it('should hash and verify passwords using production parameters', async () => {
      const password = 'StrongPassword!123';
      const hash = await hashPassword(password);

      expect(hash).toContain('$argon2id$');
      expect(hash).toContain('m=65536,t=3,p=4'); // Assert secure production metadata parameters

      const isMatch = await verifyPassword(hash, password);
      expect(isMatch).toBe(true);

      const isNotMatch = await verifyPassword(hash, 'wrong_password');
      expect(isNotMatch).toBe(false);
    });
  });
});
