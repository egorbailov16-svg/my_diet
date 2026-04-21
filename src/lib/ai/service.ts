import type { AIProvider } from "@/lib/ai/provider";
import type {
  AIDraftResponse,
  AudioTranscriptionDraft,
  MealParseDraft,
  ParseMealTextInput,
  SummarizeWeekInput,
  TranscribeAudioInput,
  WeekSummaryDraft,
} from "@/lib/ai/types";
import { MockAIProvider } from "@/lib/ai/mock-provider";

export type HumanConfirmationResult<TDraft> =
  | { confirmed: true; draft: TDraft }
  | { confirmed: false; reason?: string };

export type HumanConfirmationHandler<TDraft> = (draft: AIDraftResponse<TDraft>) => Promise<HumanConfirmationResult<TDraft>>;

export class AIService {
  constructor(private readonly provider: AIProvider) {}

  async parseMealTextDraft(input: ParseMealTextInput) {
    return this.provider.parseMealText(input);
  }

  async transcribeAudioDraft(input: TranscribeAudioInput) {
    return this.provider.transcribeAudio(input);
  }

  async summarizeWeekDraft(input: SummarizeWeekInput) {
    return this.provider.summarizeWeek(input);
  }

  // AI returns draft only. Caller decides whether and how to persist.
  async parseMealTextWithConfirmation(
    input: ParseMealTextInput,
    confirm: HumanConfirmationHandler<MealParseDraft>,
  ): Promise<HumanConfirmationResult<MealParseDraft>> {
    const draft = await this.provider.parseMealText(input);
    return confirm(draft);
  }

  async transcribeAudioWithConfirmation(
    input: TranscribeAudioInput,
    confirm: HumanConfirmationHandler<AudioTranscriptionDraft>,
  ): Promise<HumanConfirmationResult<AudioTranscriptionDraft>> {
    const draft = await this.provider.transcribeAudio(input);
    return confirm(draft);
  }

  async summarizeWeekWithConfirmation(
    input: SummarizeWeekInput,
    confirm: HumanConfirmationHandler<WeekSummaryDraft>,
  ): Promise<HumanConfirmationResult<WeekSummaryDraft>> {
    const draft = await this.provider.summarizeWeek(input);
    return confirm(draft);
  }
}

export function createDefaultAIService(): AIService {
  return new AIService(new MockAIProvider());
}
