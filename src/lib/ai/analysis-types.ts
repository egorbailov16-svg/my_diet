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
  // Profile snapshot used to determine the user's goal.
  // (We intentionally keep these optional because older calls may not provide them.)
  heightCm?: number;
  currentWeightKg?: number | null;
  goalWeightKg?: number | null;
  plannedActivityKcal?: number | null;
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

export type RationCandidate = {
  id: string;
  type: "food" | "recipe";
  title: string;
  nutrientsPer100g: { kcal: number; protein: number; fat: number; carbs: number };
};

export type AnalyzeRationInput = {
  date: string;
  consumed: { kcal: number; protein: number; fat: number; carbs: number };
  target: {
    kcalMin: number;
    kcalMax: number;
    proteinTarget: number;
    fatMin: number;
    fatMax: number;
    carbsMin: number;
    carbsMax: number;
  };
  remaining: {
    kcal: number;
    protein: number;
    fat: number;
    carbs: number;
  };
  candidates: RationCandidate[];
};

export type RationSuggestion = {
  title: string;
  type: "food" | "recipe";
  portionG: number;
  estimated: { kcal: number; protein: number; fat: number; carbs: number };
  reason: string;
};

export type RationAdvice = {
  summary: string;
  suggestions: RationSuggestion[];
  notes?: string[];
};
