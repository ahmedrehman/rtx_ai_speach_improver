import { consumeSseEvents, type SpeechEvalStreamEvent } from "../lib_speech_contract";

export type StreamEvalResult = {
  ok: boolean;
  error?: string;
  events: SpeechEvalStreamEvent[];
};

export async function streamEvalRequest(
  endpoint: string,
  body: unknown,
  onEvent: (event: SpeechEvalStreamEvent) => void
): Promise<StreamEvalResult> {
  const events: SpeechEvalStreamEvent[] = [];
  let errorMessage = "";

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!response.ok || !response.body) {
    let message = `Request failed with ${response.status}`;
    try {
      const data = await response.json() as { error?: string };
      if (data?.error) message = data.error;
    } catch {
      // Keep the status message.
    }
    return { ok: false, error: message, events };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";

  const handle = (event: SpeechEvalStreamEvent) => {
    events.push(event);
    if (event.type === "error") errorMessage = event.status.error || "Stream error";
    onEvent(event);
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    pending += decoder.decode(value, { stream: true });
    const parsed = consumeSseEvents(pending);
    pending = parsed.remaining;
    for (const event of parsed.events) handle(event);
  }
  for (const event of consumeSseEvents(pending).events) handle(event);

  return errorMessage ? { ok: false, error: errorMessage, events } : { ok: true, events };
}
