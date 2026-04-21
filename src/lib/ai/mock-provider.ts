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
import { parseQuickEntryText } from "@/lib/data";

function nowISO(): string {
  return new Date().toISOString();
}

function draftMeta(providerId: string, modelId: string) {
  return {
    providerId,
    modelId,
    generatedAt: nowISO(),
  };
}

export class MockAIProvider implements AIProvider {
  providerId = "mock";
  modelId = "mock-v1";

  async parseMealText(input: ParseMealTextInput): Promise<AIDraftResponse<MealParseDraft>> {
    const items = parseQuickEntryText(input.text);
    const notes: string[] = [];

    if (items.length === 0) {
      notes.push("No structured items detected. User should edit draft manually.");
    }

    return {
      draft: {
        rawText: input.text,
        items,
        notes,
      },
      confidence: items.length > 0 ? 0.76 : 0.22,
      meta: draftMeta(this.providerId, this.modelId),
    };
  }

  async transcribeAudio(input: TranscribeAudioInput): Promise<AIDraftResponse<AudioTranscriptionDraft>> {
    void input;
    return {
      draft: {
        text: "",
        language: "ru",
        notes: ["Mock provider returns empty transcription draft. Fill manually."],
      },
      confidence: 0.1,
      meta: draftMeta(this.providerId, this.modelId),
    };
  }

  async summarizeWeek(input: SummarizeWeekInput): Promise<AIDraftResponse<WeekSummaryDraft>> {
    const draft: WeekSummaryDraft = {
      title: `Week ${input.weekStartISO} - ${input.weekEndISO}`,
      highlights: [
        `Average kcal: ${Math.round(input.avgKcal)}`,
        `Average macros (P/F/C): ${Math.round(input.avgProtein)}/${Math.round(input.avgFat)}/${Math.round(input.avgCarbs)}`,
      ],
      cautions: [`Average weight: ${input.avgWeight.toFixed(1)} kg`],
      nextActions: ["Review meal logs and confirm targets manually."],
    };

    return {
      draft,
      confidence: 0.64,
      meta: draftMeta(this.providerId, this.modelId),
    };
  }
}
