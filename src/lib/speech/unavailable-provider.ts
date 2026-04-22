import type { SpeechProvider } from "@/lib/speech/provider";
import type { SpeechAvailabilityInfo, SpeechTranscriptionResult } from "@/lib/speech/types";

export class UnavailableSpeechProvider implements SpeechProvider {
  id = "unavailable";

  getAvailability(): SpeechAvailabilityInfo {
    return { availability: "unavailable", reason: "speech api unsupported" };
  }

  async listenOnce(lang: string): Promise<SpeechTranscriptionResult> {
    void lang;
    throw new Error("Speech recognition unavailable");
  }
}
