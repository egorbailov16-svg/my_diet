import type { SpeechAvailability, SpeechTranscriptionResult } from "@/lib/speech/types";

export interface SpeechProvider {
  id: string;
  getAvailability(): SpeechAvailability;
  listenOnce(lang: string): Promise<SpeechTranscriptionResult>;
}
