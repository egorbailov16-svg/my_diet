import type { SpeechAvailabilityInfo, SpeechTranscriptionResult } from "@/lib/speech/types";

export interface SpeechProvider {
  id: string;
  getAvailability(): SpeechAvailabilityInfo;
  listenOnce(lang: string): Promise<SpeechTranscriptionResult>;
}
