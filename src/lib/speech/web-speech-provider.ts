import type { SpeechProvider } from "@/lib/speech/provider";
import type { SpeechAvailabilityInfo, SpeechTranscriptionResult } from "@/lib/speech/types";

type SpeechResult = {
  transcript?: string;
  confidence?: number;
};

type RecognitionResultLike = ArrayLike<SpeechResult> & { isFinal?: boolean };

type RecognitionEventLike = {
  results?: ArrayLike<RecognitionResultLike>;
};

type RecognitionErrorEventLike = {
  error?: string;
  message?: string;
};

type RecognitionInstance = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onresult: ((event: RecognitionEventLike) => void) | null;
  onerror: ((event: RecognitionErrorEventLike) => void) | null;
  onnomatch: (() => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  abort: () => void;
  start: () => void;
  stop: () => void;
};

type BrowserSpeechRecognition = new () => RecognitionInstance;

declare global {
  interface Window {
    webkitSpeechRecognition?: BrowserSpeechRecognition;
    SpeechRecognition?: BrowserSpeechRecognition;
  }
}

function describeSpeechError(error?: string): string {
  switch (error) {
    case "not-allowed":
    case "service-not-allowed":
      return "Доступ к микрофону запрещен. Разреши его в настройках браузера.";
    case "no-speech":
      return "Не услышал речь. Говори ближе к микрофону и громче.";
    case "audio-capture":
      return "Не удалось получить аудио с микрофона. Проверь подключение устройства.";
    case "network":
      return "Сеть недоступна для распознавания речи.";
    case "aborted":
      return "Распознавание прервано.";
    default:
      return error ? `Ошибка распознавания: ${error}` : "Неизвестная ошибка распознавания.";
  }
}

async function ensureMicrophonePermission(): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (typeof window === "undefined") return { ok: false, reason: "no window" };
  if (!navigator?.mediaDevices?.getUserMedia) {
    return { ok: true };
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "permission denied";
    return { ok: false, reason: message };
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
    if (!window.isSecureContext) return { availability: "unavailable", reason: "Голосовой ввод требует HTTPS" };
    if (!this.getCtor()) {
      return {
        availability: "unavailable",
        reason: "Этот браузер не поддерживает Web Speech API. Открой сайт в Chrome/Edge или установи как PWA.",
      };
    }
    return { availability: "available" };
  }

  async listenOnce(lang: string): Promise<SpeechTranscriptionResult> {
    const Ctor = this.getCtor();
    if (!Ctor) {
      throw new Error("SpeechRecognition API unavailable");
    }

    const permission = await ensureMicrophonePermission();
    if (!permission.ok) {
      throw new Error(`Доступ к микрофону запрещен: ${permission.reason}`);
    }

    return new Promise((resolve, reject) => {
      const recognition = new Ctor();
      recognition.lang = lang;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.continuous = true;
      let transcript = "";
      let confidence = 0.5;
      let lastErrorMessage: string | null = null;

      const stopId = window.setTimeout(() => {
        try {
          recognition.stop();
        } catch {
          recognition.abort();
        }
      }, 14000);

      recognition.onstart = () => {
        // mic open — no-op
      };

      recognition.onresult = (event: RecognitionEventLike) => {
        const results = event.results;
        if (!results) return;
        let merged = "";
        let conf = confidence;
        for (let i = 0; i < results.length; i += 1) {
          const result = results[i]?.[0];
          if (!result?.transcript) continue;
          merged += `${result.transcript} `;
          if (typeof result.confidence === "number" && Number.isFinite(result.confidence) && result.confidence > 0) {
            conf = result.confidence;
          }
        }
        transcript = merged.trim();
        confidence = conf;
      };

      recognition.onerror = (event: RecognitionErrorEventLike) => {
        lastErrorMessage = describeSpeechError(event?.error);
      };

      recognition.onnomatch = () => {
        lastErrorMessage = lastErrorMessage ?? "Не удалось распознать речь.";
      };

      recognition.onend = () => {
        window.clearTimeout(stopId);
        if (transcript) {
          resolve({ text: transcript, confidence });
          return;
        }
        reject(new Error(lastErrorMessage ?? "Пустой результат распознавания. Попробуй еще раз."));
      };

      try {
        recognition.start();
      } catch (error) {
        window.clearTimeout(stopId);
        reject(new Error(error instanceof Error ? error.message : "Не удалось запустить распознавание."));
      }
    });
  }
}
