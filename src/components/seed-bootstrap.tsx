"use client";

import { initializeSeedData } from "@/lib/data/init";
import { useEffect } from "react";

export function SeedBootstrap() {
  useEffect(() => {
    initializeSeedData().catch((error: unknown) => {
      console.error("Seed initialization failed", error);
    });
  }, []);

  return null;
}
