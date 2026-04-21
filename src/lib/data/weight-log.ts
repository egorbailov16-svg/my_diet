import { calculateWeeklyAverageWeight } from "@/lib/data/calculations";
import type { WeightLog } from "@/lib/data/types";

function toDateValue(date: string): number {
  return new Date(`${date}T00:00:00`).getTime();
}

export function getWeightForDate(weightLogs: WeightLog[], date: string): WeightLog | null {
  return weightLogs.find((item) => item.date === date) ?? null;
}

export function getLastNDaysWeightLogs(weightLogs: WeightLog[], endDate: string, days: number): WeightLog[] {
  const end = toDateValue(endDate);
  const start = end - (days - 1) * 24 * 60 * 60 * 1000;

  return weightLogs
    .filter((item) => {
      const value = toDateValue(item.date);
      return value >= start && value <= end;
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function getWeeklyAverageWeight(weightLogs: WeightLog[], endDate: string): number {
  return calculateWeeklyAverageWeight(getLastNDaysWeightLogs(weightLogs, endDate, 7));
}
