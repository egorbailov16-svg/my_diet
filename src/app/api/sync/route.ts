import { NextResponse } from "next/server";

const DEFAULT_BLOB_URL = "https://jsonblob.com/api/jsonBlob/019db9ae-4b13-77bd-b5d6-7b092e472a16";
const BLOB_URL = (process.env.SYNC_BLOB_URL?.trim() || DEFAULT_BLOB_URL);

const EMPTY_DOC = {
  syncedAt: "1970-01-01T00:00:00.000Z",
  foods: [],
  recipes: [],
  recipeIngredients: [],
  mealEntries: [],
  dayLogs: [],
  dayTargets: [],
  weightLogs: [],
  profile: null,
  deleted: {},
};

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const response = await fetch(BLOB_URL, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) {
      return NextResponse.json(EMPTY_DOC, {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      });
    }
    const data = await response.json();
    return NextResponse.json(data, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("sync GET failed", error);
    return NextResponse.json(EMPTY_DOC, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  }
}

export async function PUT(request: Request) {
  try {
    const text = await request.text();
    const response = await fetch(BLOB_URL, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: text,
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error("jsonblob PUT failed", response.status, detail.slice(0, 200));
      return NextResponse.json({ ok: false, status: response.status }, { status: 502 });
    }
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error("sync PUT failed", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
