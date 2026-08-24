import { NextRequest, NextResponse } from "next/server";
import { serverDb } from "@/lib/server-state";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const token = body.token;
    const newPassword = body.password;

    if (!token || !newPassword) {
      return NextResponse.json(
        { message: "Token and password are required", code: "VALIDATION_ERROR" },
        { status: 400 },
      );
    }

    if (newPassword.length < 8) {
      return NextResponse.json(
        { message: "Password must be at least 8 characters", code: "VALIDATION_ERROR" },
        { status: 400 },
      );
    }

    // Update demo or target user
    const demo = serverDb.users.get("user-demo");
    if (demo) {
      demo.passwordHash = newPassword;
      demo.updatedAt = new Date().toISOString();
      serverDb.users.set(demo.id, demo);
    }

    return NextResponse.json({
      success: true,
      message: "Password has been successfully updated. You may now log in.",
    });
  } catch (error: any) {
    return NextResponse.json(
      { message: error?.message || "Password reset failed", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
