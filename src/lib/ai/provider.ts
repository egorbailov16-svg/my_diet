import type {
  AIDraftResponse,
  AudioTranscriptionDraft,
  MealParseDraft,
  ParseMealTextInput,
  SummarizeWeekInput,
  TranscribeAudioInput,
  WeekSummaryDraft,
} from "@/lib/ai/types";

export interface AIProvider {
  providerId: string;
  modelId: string;
  parseMealText(input: ParseMealTextInput): Promise<AIDraftResponse<MealParseDraft>>;
  transcribeAudio(input: TranscribeAudioInput): Promise<AIDraftResponse<AudioTranscriptionDraft>>;
  summarizeWeek(input: SummarizeWeekInput): Promise<AIDraftResponse<WeekSummaryDraft>>;
}
