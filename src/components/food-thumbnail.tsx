"use client";

import { useMemo, useState } from "react";

function hashString(input: string): number {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function svgFallbackDataUrl(name: string): string {
  const label = (name.trim()[0] ?? "?").toUpperCase();
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='96' height='96' viewBox='0 0 96 96'>
  <defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop stop-color='#1f2c3f'/><stop offset='1' stop-color='#111a28'/></linearGradient></defs>
  <rect width='96' height='96' rx='22' fill='url(#g)'/>
  <text x='50%' y='54%' dominant-baseline='middle' text-anchor='middle' font-size='34' font-family='Arial' fill='#dce8f8'>${label}</text>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function makeCandidates(name: string, preferredUrl?: string): string[] {
  const seed = hashString(name || "food");
  const urls: string[] = [];
  if (preferredUrl) urls.push(preferredUrl);
  urls.push(`https://loremflickr.com/96/96/food?lock=${seed}`);
  urls.push(`https://picsum.photos/seed/food-${seed}/96/96`);
  urls.push(svgFallbackDataUrl(name));
  return urls;
}

type FoodThumbnailProps = {
  name: string;
  preferredUrl?: string;
};

export function FoodThumbnail({ name, preferredUrl }: FoodThumbnailProps) {
  const candidates = useMemo(() => makeCandidates(name, preferredUrl), [name, preferredUrl]);
  const [index, setIndex] = useState(0);

  return (
    <img
      src={candidates[Math.min(index, candidates.length - 1)]}
      alt={name}
      className="food-thumb"
      loading="lazy"
      onError={() => setIndex((prev) => Math.min(prev + 1, candidates.length - 1))}
    />
  );
}
