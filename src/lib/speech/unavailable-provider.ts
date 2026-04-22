import type { SpeechProvider } from "@/lib/speech/provider";
import type { SpeechAvailability, SpeechTranscriptionResult } from "@/lib/speech/types";

export class UnavailableSpeechProvider implements SpeechProvider {
  id = "unavailable";

  getAvailability(): SpeechAvailability {
    return "unavailable";
  }

  async listenOnce(lang: string): Promise<SpeechTranscriptionResult> {
    void lang;
    throw new Error("Speech recognition unavailable");
  }
}
