import { NextRequest, NextResponse } from "next/server";
import { serverDb } from "@/lib/server-state";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = (body.email || "").toLowerCase().trim();

    if (!email) {
      return NextResponse.json(
        { message: "Email is required", code: "VALIDATION_ERROR" },
        { status: 400 },
      );
    }

    // Return neutral success message to prevent user enumeration
    return NextResponse.json({
      success: true,
      message: "If an account matches that email, a password reset link has been dispatched.",
    });
  } catch (error: any) {
    return NextResponse.json(
      { message: error?.message || "Password reset request failed", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
