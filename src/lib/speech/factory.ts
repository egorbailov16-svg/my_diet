import type { SpeechProvider } from "@/lib/speech/provider";
import { UnavailableSpeechProvider } from "@/lib/speech/unavailable-provider";
import { WebSpeechProvider } from "@/lib/speech/web-speech-provider";

export function createSpeechProvider(): SpeechProvider {
  const provider = new WebSpeechProvider();
  if (provider.getAvailability().availability === "available") {
    return provider;
  }

  return new UnavailableSpeechProvider();
}
