export type ID = string;
export type ISODate = string;
export type ISODateTime = string;

export type DayType = "normal" | "strength";
export type FoodSource = "custom" | "imported" | "external";
export type RecentItemType = "food" | "recipe";
export type ActivitySource = "manual" | "apple_health";
export type HealthSyncStatus = "idle" | "syncing" | "success" | "error" | "unavailable";
export type HealthPermissionsState = "unknown" | "granted" | "denied" | "unavailable";
export type DayStatus = "active" | "completed";

export type NutrientsPer100g = {
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
};

export type NutrientsTotal = {
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
};

export type Profile = {
  id: "profile";
  name: string;
  heightCm?: number;
  currentWeightKg?: number;
  goalWeightKg?: number;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
};

export type DayTarget = {
  id: DayType;
  dayType: DayType;
  kcalMin: number;
  kcalMax: number;
  proteinTarget: number;
  fatMin: number;
  fatMax: number;
  carbsMin: number;
  carbsMax: number;
  updatedAt: ISODateTime;
};

export type DayLog = {
  id: ISODate;
  date: ISODate;
  dayType: DayType;
  activeKcal: number;
  activitySource?: ActivitySource;
  lastActivitySyncAt?: ISODateTime;
  healthSyncStatus?: HealthSyncStatus;
  manualActivityOverride?: boolean;
  healthPermissionsState?: HealthPermissionsState;
  healthSyncedActiveKcal?: number;
  notes?: string;
  status?: DayStatus;
  dayAnalysis?: {
    summary: string;
    good: string[];
    issues: string[];
    nextDayActions: string[];
    limitations?: string[];
  };
  dayAnalysisAt?: ISODateTime;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
};

export type Food = {
  id: ID;
  name: string;
  source: FoodSource;
  externalRefId?: string;
  externalMeta?: {
    provider: string;
    externalId: string;
    barcode?: string;
    rawName?: string;
    importedAt?: ISODateTime;
    rawSource?: Record<string, unknown>;
  };
  note?: string;
  nutrientsPer100g: NutrientsPer100g;
  micronutrientsPer100g?: Record<string, number>;
  vitaminsPer100g?: Record<string, number>;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
};

export type Recipe = {
  id: ID;
  name: string;
  cookedWeightG?: number;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
};

export type RecipeIngredient = {
  id: ID;
  recipeId: ID;
  foodId: ID;
  weightG: number;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
};

export type MealEntry = {
  id: ID;
  dayLogId: ISODate;
  mealType: "breakfast" | "lunch" | "dinner" | "snack";
  sourceType: "food" | "recipe";
  sourceId: ID;
  amountG: number;
  consumedAt: ISODateTime;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
};

export type WeightLog = {
  id: ID;
  date: ISODate;
  weightKg: number;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
};

export type RecentItem = {
  id: ID;
  itemType: RecentItemType;
  itemId: ID;
  lastUsedAt: ISODateTime;
  useCount: number;
  lastAmountG?: number;
};

export type PeriodRangeDays = 7 | 14 | 30;

export type PeriodAnalysis = {
  id: string;
  rangeDays: PeriodRangeDays;
  startDate: ISODate;
  endDate: ISODate;
  summary: string;
  good: string[];
  issues: string[];
  weightAndProgress: string[];
  nutrition: string[];
  activity: string[];
  micronutrients: {
    enoughData: boolean;
    text: string;
  };
  improve: string[];
  reduce: string[];
  generatedAt: ISODateTime;
};

export type DBSchema = {
  profile: Profile;
  dayTargets: DayTarget;
  dayLogs: DayLog;
  foods: Food;
  recipes: Recipe;
  recipeIngredients: RecipeIngredient;
  mealEntries: MealEntry;
  weightLogs: WeightLog;
  recentItems: RecentItem;
  periodAnalyses: PeriodAnalysis;
};
