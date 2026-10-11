import type { UserProfile } from "@platform/types";
import { Role, PermissionOverrideType } from "@platform/types";
import { resolveUserPermissions } from "@platform/auth";

/** Relations to include when loading a user for `toUserProfile`. */
export const USER_PROFILE_INCLUDE = {
  profile: true,
  roleAssignments: true,
  permissionAssignments: true,
} as const;

type UserWithProfile = {
  id: string;
  email: string;
  username: string;
  displayName: string;
  accountStatus: string;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
  profile?: {
    biography: string | null;
    avatarUrl: string | null;
    country: string | null;
    websiteUrl: string | null;
    spotifyProfileUrl: string | null;
  } | null;
  roleAssignments?: { role: string }[];
  permissionAssignments?: { permission: string }[];
};

/** The `UserProfile` shape the web app expects (never includes secrets). */
export function toUserProfile(user: UserWithProfile): UserProfile {
  const roles = (user.roleAssignments ?? []).map((r) => r.role as Role);
  if (roles.length === 0) roles.push(Role.USER);
  const permissions = Array.from(
    resolveUserPermissions(
      roles,
      (user.permissionAssignments ?? []).map((p) => ({
        permission: p.permission as any,
        // Stored assignments are grants (the table has no type column)
        type: PermissionOverrideType.GRANT,
      })),
    ),
  );
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    displayName: user.displayName,
    bio: user.profile?.biography ?? null,
    avatarUrl: user.profile?.avatarUrl ?? null,
    country: user.profile?.country ?? null,
    websiteUrl: user.profile?.websiteUrl ?? null,
    spotifyProfileUrl: user.profile?.spotifyProfileUrl ?? null,
    accountStatus: user.accountStatus as UserProfile["accountStatus"],
    emailVerified: user.emailVerified,
    roles,
    permissions,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
