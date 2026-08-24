import { NextRequest, NextResponse } from "next/server";
import { serverDb, createSessionForUser, sanitizeUser, StoredUser } from "@/lib/server-state";
import { Role, AccountStatus } from "@platform/types";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = (body.email || "").toLowerCase().trim();
    const username = (body.username || "").toLowerCase().trim();
    const displayName = (body.displayName || "").trim();
    const password = body.password || "";

    if (!email || !username || !displayName || !password) {
      return NextResponse.json(
        { message: "All fields are required", code: "VALIDATION_ERROR" },
        { status: 400 },
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { message: "Password must be at least 8 characters", code: "VALIDATION_ERROR" },
        { status: 400 },
      );
    }

    // Check if email or username already exists
    for (const user of serverDb.users.values()) {
      if (user.email.toLowerCase() === email) {
        return NextResponse.json(
          { message: "An account with this email already exists", code: "EMAIL_ALREADY_EXISTS" },
          { status: 409 },
        );
      }
      if (user.username.toLowerCase() === username) {
        return NextResponse.json(
          { message: "Username is already taken", code: "USERNAME_ALREADY_EXISTS" },
          { status: 409 },
        );
      }
    }

    const newUser: StoredUser = {
      id: `user-${Date.now()}`,
      email,
      username,
      displayName,
      passwordHash: password,
      accountStatus: AccountStatus.ACTIVE,
      emailVerified: true,
      bio: "",
      avatarUrl: null,
      country: null,
      websiteUrl: null,
      roles: [Role.USER],
      permissions: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    serverDb.users.set(newUser.id, newUser);

    serverDb.userPreferences.set(newUser.id, {
      emailNotifications: true,
      marketingEmails: false,
      soundEffects: true,
      themeMode: "dark",
    });

    const ip = request.headers.get("x-forwarded-for") || "127.0.0.1";
    const userAgent = request.headers.get("user-agent") || "Web Browser";

    const { cookie } = createSessionForUser(newUser.id, ip, userAgent);

    serverDb.securityLogs.unshift({
      id: `sec-${Date.now()}`,
      userId: newUser.id,
      eventType: "REGISTER_SUCCESS",
      ipAddress: ip,
      userAgent,
      createdAt: new Date().toISOString(),
    });

    const response = NextResponse.json({
      success: true,
      message: "Account created successfully",
      user: sanitizeUser(newUser),
    });

    response.headers.set("Set-Cookie", cookie);
    return response;
  } catch (error: any) {
    return NextResponse.json(
      { message: error?.message || "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
