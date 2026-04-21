import type { ParsedQuickEntryItem } from "@/lib/data";

export type AIConfidenceScore = number;

export type AIDraftMeta = {
  providerId: string;
  modelId: string;
  generatedAt: string;
};

export type AIDraftResponse<TDraft> = {
  draft: TDraft;
  confidence: AIConfidenceScore;
  meta: AIDraftMeta;
};

export type MealParseDraft = {
  rawText: string;
  items: ParsedQuickEntryItem[];
  notes: string[];
};

export type AudioTranscriptionDraft = {
  text: string;
  language?: string;
  notes: string[];
};

export type WeekSummaryDraft = {
  title: string;
  highlights: string[];
  cautions: string[];
  nextActions: string[];
};

export type ParseMealTextInput = {
  text: string;
};

export type TranscribeAudioInput = {
  audioBlob: Blob;
  mimeType?: string;
};

export type SummarizeWeekInput = {
  weekStartISO: string;
  weekEndISO: string;
  avgKcal: number;
  avgProtein: number;
  avgFat: number;
  avgCarbs: number;
  avgWeight: number;
};
