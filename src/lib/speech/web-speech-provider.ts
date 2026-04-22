import type { SpeechProvider } from "@/lib/speech/provider";
import type { SpeechAvailability, SpeechTranscriptionResult } from "@/lib/speech/types";

type SpeechResult = {
  transcript?: string;
  confidence?: number;
};

type RecognitionEventLike = {
  results?: ArrayLike<ArrayLike<SpeechResult>>;
};

type RecognitionInstance = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onresult: ((event: RecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onnomatch: (() => void) | null;
  start: () => void;
};

type BrowserSpeechRecognition = new () => RecognitionInstance;

declare global {
  interface Window {
    webkitSpeechRecognition?: BrowserSpeechRecognition;
    SpeechRecognition?: BrowserSpeechRecognition;
  }
}

export class WebSpeechProvider implements SpeechProvider {
  id = "web-speech";

  private getCtor(): BrowserSpeechRecognition | null {
    if (typeof window === "undefined") return null;
    return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
  }

  getAvailability(): SpeechAvailability {
    return this.getCtor() ? "available" : "unavailable";
  }

  async listenOnce(lang: string): Promise<SpeechTranscriptionResult> {
    const Ctor = this.getCtor();
    if (!Ctor) {
      throw new Error("SpeechRecognition API unavailable");
    }

    return new Promise((resolve, reject) => {
      const recognition = new Ctor();
      recognition.lang = lang;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.continuous = false;

      recognition.onresult = (event: RecognitionEventLike) => {
        const result = event.results?.[0]?.[0];
        resolve({
          text: result?.transcript?.trim() ?? "",
          confidence: typeof result?.confidence === "number" ? result.confidence : 0.5,
        });
      };

      recognition.onerror = () => {
        reject(new Error("Speech recognition failed"));
      };

      recognition.onnomatch = () => {
        reject(new Error("No speech match"));
      };

      recognition.start();
    });
  }
}
