export type SpeechAvailability = "available" | "unavailable";

export type SpeechAvailabilityInfo = {
  availability: SpeechAvailability;
  reason?: string;
};

export type SpeechTranscriptionResult = {
  text: string;
  confidence: number;
};
