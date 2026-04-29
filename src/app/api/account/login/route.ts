import { NextResponse } from "next/server";
import { validateServerAccountCredentials } from "@/lib/account/manual-accounts.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYNC_COOKIE_NAME = "mydiet_sync_session";

type LoginPayload = {
  username?: string;
  password?: string;
};

export async function POST(request: Request) {
  const syncToken = process.env.SYNC_API_TOKEN?.trim();
  if (!syncToken) {
    return NextResponse.json({ ok: false, error: "SYNC_API_TOKEN is not configured" }, { status: 500 });
  }

  let payload: LoginPayload;
  try {
    payload = (await request.json()) as LoginPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const account = validateServerAccountCredentials(payload.username ?? "", payload.password ?? "");
  if (!account) {
    return NextResponse.json({ ok: false, error: "Invalid credentials" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true, account }, { status: 200 });
  response.cookies.set(SYNC_COOKIE_NAME, syncToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
