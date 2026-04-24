export type ExtendedDayAnalysis = {
  summary: string;
  good: string[];
  issues: string[];
  nextDayActions: string[];
  predictions: string[];
  recommendations: string[];
  limitations?: string[];
};

export type ExtendedPeriodAnalysis = {
  summary: string;
  whatWentWell: string[];
  whatWentWrong: string[];
  weightAndProgress: string[];
  nutrition: string[];
  activity: string[];
  micronutrients: string[];
  expectedVsActual: string[];
  recommendations: string[];
  cutDown: string[];
  limitations?: string[];
};

export type AnalyzeDayInput = {
  date: string;
  dayType: string;
  consumed: { kcal: number; protein: number; fat: number; carbs: number };
  activeKcal: number;
  netKcal: number;
  target?: {
    kcalMin: number;
    kcalMax: number;
    proteinTarget: number;
    fatMin: number;
    fatMax: number;
    carbsMin: number;
    carbsMax: number;
  } | null;
  micronutrients?: Record<string, number>;
  vitamins?: Record<string, number>;
  micronutrientNorms?: Record<string, number>;
  micronutrientCoverage?: number;
  entries?: Array<{
    title: string;
    mealType?: string;
    amountG: number;
    nutrients: { kcal: number; protein: number; fat: number; carbs: number };
  }>;
  weightKg?: number | null;
};

export type AnalyzePeriodInput = {
  rangeDays: number;
  startDate: string;
  endDate: string;
  avgConsumed: { kcal: number; protein: number; fat: number; carbs: number };
  avgActivity: number;
  avgNetKcal: number;
  weightStartKg?: number | null;
  weightEndKg?: number | null;
  weightDeltaKg: number;
  completedDays: number;
  totalDays: number;
  planHitRate: number;
  micronutrientCoverage: number;
  microTotals?: Record<string, number>;
  vitaminTotals?: Record<string, number>;
  microNorms?: Record<string, number>;
  daily: Array<{
    date: string;
    dayType: string;
    status: string;
    consumed: { kcal: number; protein: number; fat: number; carbs: number };
    activeKcal: number;
    netKcal: number;
  }>;
  notes?: string;
};
