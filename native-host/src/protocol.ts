// ─── BridgeMessage: mensagens do Service Worker para o Host ───

export type ThinkingLevel = "off" | "low" | "medium" | "high";

export type BridgeMessage =
  | { type: "prompt"; message: string; images?: string[] }
  | { type: "setModel"; provider: string; model: string }
  | { type: "setThinking"; level: ThinkingLevel }
  | { type: "abort" }
  | { type: "listModels" }
  | { type: "newSession" }
  | { type: "setSystemPrompt"; prompt: string }
  | { type: "toolResult"; toolCallId: string; content: string; error?: string; images?: string[] }
  | { type: "resumeSession"; sessionId?: string };

// ─── HostEvent: eventos do Host para o Service Worker ───

export type HostEvent =
  | { type: "delta"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "toolStart"; name: string; input: Record<string, unknown> }
  | { type: "toolExec"; toolCallId: string; name: string; args: Record<string, unknown> }
  | { type: "toolEnd"; name: string; result: string; error?: boolean }
  | { type: "turnEnd"; text: string; reasoning?: string }
  | { type: "done" }
  | { type: "error"; message: string }
  | { type: "modelList"; providers: Array<{ id: string; name: string; models: Array<{ id: string; name: string }> }> }
  | { type: "sessionInfo"; sessionId: string; messageCount: number }
  | { type: "compaction"; status: "started" | "ended" };
