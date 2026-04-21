export type ID = string;
export type ISODate = string;
export type ISODateTime = string;

export type DayType = "normal" | "strength";
export type FoodSource = "custom" | "external";
export type RecentItemType = "food" | "recipe";

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
  notes?: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
};

export type Food = {
  id: ID;
  name: string;
  source: FoodSource;
  externalRefId?: string;
  note?: string;
  nutrientsPer100g: NutrientsPer100g;
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
};
