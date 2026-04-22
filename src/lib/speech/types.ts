export type SpeechAvailability = "available" | "unavailable";

export type SpeechTranscriptionResult = {
  text: string;
  confidence: number;
};
