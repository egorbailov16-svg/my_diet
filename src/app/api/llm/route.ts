import { generateResponse, LlmClientError, type LlmMessage, NVIDIA_MODEL } from "@/services/llmClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type IncomingPayload = {
  messages?: LlmMessage[];
  includeReasoning?: boolean;
};

function sseLine(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: Request) {
  let payload: IncomingPayload;
  try {
    payload = (await request.json()) as IncomingPayload;
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid JSON body" }), { status: 400 });
  }

  const messages = payload.messages ?? [];
  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response(JSON.stringify({ ok: false, error: "messages are required" }), { status: 400 });
  }

  const includeReasoning = Boolean(payload.includeReasoning);
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode(sseLine({ type: "meta", provider: "nvidia-deepseek", model: NVIDIA_MODEL })));
        for await (const chunk of generateResponse(messages, { maxTokens: 8192, timeoutMs: 30000 })) {
          if (chunk.content) {
            controller.enqueue(encoder.encode(sseLine({ type: "content", delta: chunk.content })));
          }
          if (includeReasoning && chunk.reasoningContent) {
            controller.enqueue(encoder.encode(sseLine({ type: "reasoning", delta: chunk.reasoningContent })));
          }
        }
        controller.enqueue(encoder.encode(sseLine({ type: "done" })));
      } catch (error) {
        const message = error instanceof LlmClientError ? error.message : "LLM request failed";
        controller.enqueue(encoder.encode(sseLine({ type: "error", message })));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
