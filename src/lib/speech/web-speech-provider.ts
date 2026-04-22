import type { SpeechProvider } from "@/lib/speech/provider";
import type { SpeechAvailabilityInfo, SpeechTranscriptionResult } from "@/lib/speech/types";

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
  onend: (() => void) | null;
  abort: () => void;
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

  getAvailability(): SpeechAvailabilityInfo {
    if (typeof window === "undefined") return { availability: "unavailable", reason: "server-side" };
    if (!window.isSecureContext) return { availability: "unavailable", reason: "requires https" };
    if (!this.getCtor()) return { availability: "unavailable", reason: "speech api unsupported" };
    return { availability: "available" };
  }

  async listenOnce(lang: string): Promise<SpeechTranscriptionResult> {
    const Ctor = this.getCtor();
    if (!Ctor) {
      throw new Error("SpeechRecognition API unavailable");
    }

    return new Promise((resolve, reject) => {
      const recognition = new Ctor();
      recognition.lang = lang;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.continuous = true;
      let transcript = "";
      let confidence = 0.5;
      const stopId = window.setTimeout(() => {
        recognition.abort();
      }, 12000);

      recognition.onresult = (event: RecognitionEventLike) => {
        const results = event.results;
        if (!results) return;
        let merged = "";
        let conf = confidence;
        for (let i = 0; i < results.length; i += 1) {
          const result = results[i]?.[0];
          if (!result?.transcript) continue;
          merged += `${result.transcript} `;
          if (typeof result.confidence === "number") {
            conf = result.confidence;
          }
        }
        transcript = merged.trim();
        confidence = conf;
      };

      recognition.onerror = () => {
        window.clearTimeout(stopId);
        reject(new Error("speech_error"));
      };

      recognition.onnomatch = () => {
        window.clearTimeout(stopId);
        reject(new Error("no_match"));
      };

      recognition.onend = () => {
        window.clearTimeout(stopId);
        if (!transcript) {
          reject(new Error("empty_result"));
          return;
        }

        resolve({
          text: transcript,
          confidence,
        });
      };

      recognition.start();
    });
  }
}
