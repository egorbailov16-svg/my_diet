import { NextResponse } from "next/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const ENDPOINTS = [
  "https://world.openfoodfacts.org/cgi/search.pl",
  "https://world.openfoodfacts.net/cgi/search.pl",
  "https://openfoodfacts.org/cgi/search.pl",
];

const FIELDS =
  "code,product_name_ru,generic_name_ru,product_name,generic_name,brands,nutriments,image_front_small_url,image_front_url,image_url,image_small_url,image_thumb_url";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) {
    return NextResponse.json({ products: [] }, { status: 200, headers: { "Cache-Control": "no-store" } });
  }

  const params = new URLSearchParams({
    search_terms: query,
    search_simple: "1",
    action: "process",
    json: "1",
    page_size: "12",
    fields: FIELDS,
  });

  let lastError: string | null = null;
  for (const endpoint of ENDPOINTS) {
    try {
      const response = await fetch(`${endpoint}?${params.toString()}`, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "User-Agent": "MyDietTracker/1.0 (https://my-diet.app)",
        },
        cache: "no-store",
      });
      if (!response.ok) {
        lastError = `OpenFoodFacts ${response.status}`;
        continue;
      }
      const data = await response.json();
      return NextResponse.json(data, {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      });
    } catch (error) {
      lastError = error instanceof Error ? error.message : "OpenFoodFacts request failed";
    }
  }

  return NextResponse.json(
    { products: [], error: lastError ?? "OpenFoodFacts unavailable" },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}
