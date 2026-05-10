import { BridgeMessage, HostEvent } from "./protocol.js";
import { PiSDKHost } from "./pisdk-host.js";

// ─── Parse CLI arguments ────────────────────────────────

const args = process.argv.slice(2);
const sessionDir = args.includes('--session-dir') 
  ? args[args.indexOf('--session-dir') + 1] 
  : undefined;

// ─── PiSDKHost instance ─────────────────────────────────

const host = new PiSDKHost((event: HostEvent) => {
  sendEvent(event);
}, sessionDir);

// ─── Native Messaging Protocol helpers ──────────────────

/**
 * Send an event back to Chrome using the Native Messaging wire format:
 * 4 bytes (uint32 LE) = message length, followed by the JSON bytes.
 * Chrome's native messaging API expects this format on stdout.
 */
function sendEvent(event: HostEvent): void {
  console.error(`[host] >>> sending: ${event.type}`);
  const json = JSON.stringify(event);
  const len = Buffer.byteLength(json, "utf-8");
  const header = Buffer.alloc(4);
  header.writeUInt32LE(len, 0);
  process.stdout.write(header);
  process.stdout.write(json, "utf-8");
}

function onMessage(msg: BridgeMessage): void {
  console.error(`[host] received: ${msg.type}`);

  try {
    switch (msg.type) {
      case "prompt":
        console.error(`[host] prompt start (${msg.message.length} chars)`);
        trackOp(
          host.prompt(msg.message, msg.images).then(() => {
            console.error('[host] prompt completed');
          }).catch((err) => {
            console.error(`[host] prompt error: ${err instanceof Error ? err.message : String(err)}`);
            sendEvent({ type: "error", message: `Prompt failed: ${err instanceof Error ? err.message : String(err)}` });
          })
        );
        break;

      case "setModel":
        trackOp(
          host.setModel(msg.provider, msg.model).catch((err) => {
            console.error(`[host] setModel error: ${err instanceof Error ? err.message : String(err)}`);
            sendEvent({ type: "error", message: `Set model failed: ${err instanceof Error ? err.message : String(err)}` });
          })
        );
        break;

      case "setThinking":
        host.setThinking(msg.level);
        break;

      case "abort":
        trackOp(
          host.abort().catch((err) => {
            console.error(`[host] abort error: ${err instanceof Error ? err.message : String(err)}`);
          })
        );
        break;

      case "listModels":
        trackOp(
          host
            .getAvailableModels()
            .then((providers) => {
              sendEvent({ type: "modelList", providers });
            })
            .catch((err) => {
              console.error(`[host] listModels error: ${err instanceof Error ? err.message : String(err)}`);
              sendEvent({
                type: "error",
                message: `List models failed: ${err instanceof Error ? err.message : String(err)}`,
              });
            })
        );
        break;

      case "newSession":
        trackOp(
          host
            .newSession()
            .then(() => {
              // sessionInfo event is emitted by PiSDKHost internally
            })
            .catch((err) => {
              console.error(`[host] newSession error: ${err instanceof Error ? err.message : String(err)}`);
              sendEvent({
                type: "error",
                message: `New session failed: ${err instanceof Error ? err.message : String(err)}`,
              });
            })
        );
        break;

      case "setSystemPrompt":
        host.setSystemPrompt(msg.prompt);
        break;

      case "toolResult":
        console.error(`[host] toolResult: ${msg.toolCallId} (error: ${msg.error || 'none'}, content: ${(msg.content || '').substring(0, 80)})`);
        host.resolveToolCall(msg.toolCallId, msg.content, msg.error, msg.images);
        break;

      case "resumeSession":
        trackOp(
          host.resumeSession(msg.sessionId).catch((err) => {
            console.error(`[host] resumeSession error: ${err instanceof Error ? err.message : String(err)}`);
            sendEvent({
              type: "error",
              message: `Resume session failed: ${err instanceof Error ? err.message : String(err)}`,
            });
          })
        );
        break;

      default:
        sendEvent({ type: "error", message: `Unknown message type` });
        break;
    }
  } catch (err) {
    console.error(`[host] unexpected error: ${err instanceof Error ? err.message : String(err)}`);
    sendEvent({ type: "error", message: `Unexpected error: ${err instanceof Error ? err.message : String(err)}` });
  }
}

// ─── Track pending async operations ────────────────────
// Prevents process.exit from killing the host mid-response.
let pendingOps = 0;
let stdinEnded = false;

function opStarted(): void {
  pendingOps++;
}

function opFinished(): void {
  pendingOps--;
  if (pendingOps === 0 && stdinEnded) {
    process.exit(0);
  }
}

/** Wrap a promise-returning function to track its lifecycle. */
function trackOp<T>(p: Promise<T>): Promise<T> {
  opStarted();
  return p.finally(opFinished);
}

// ─── Init host ──────────────────────────────────────────

trackOp(host.init().catch((err) => {
  console.error(`[host] init error: ${err instanceof Error ? err.message : String(err)}`);
  // Don't crash — the host can still operate with partial functionality
}));

// ─── Native Messaging stdin loop ────────────────────────
//
// Chrome's Native Messaging Protocol sends/receives messages in this format:
//   [4 bytes: uint32 LE message length] [N bytes: UTF-8 JSON]
//
// See: https://developer.chrome.com/docs/extensions/develop/native-messaging

let messageBuffer = Buffer.alloc(0);
let messageLength: number | null = null;

process.stdin.on("readable", () => {
  let chunk: Buffer;
  while ((chunk = process.stdin.read()) !== null) {
    messageBuffer = Buffer.concat([messageBuffer, chunk]);

    // Keep processing as long as we have at least 4 bytes (length prefix)
    while (messageBuffer.length >= 4) {
      if (messageLength === null) {
        messageLength = messageBuffer.readUInt32LE(0);
      }

      const totalLength = 4 + messageLength;
      if (messageBuffer.length < totalLength) {
        break; // Wait for more data
      }

      // Extract the JSON message body
      const jsonBuffer = messageBuffer.slice(4, totalLength);
      const json = jsonBuffer.toString("utf-8");

      // Remove consumed bytes from the buffer
      messageBuffer = messageBuffer.slice(totalLength);
      messageLength = null;

      // Parse and handle the message
      try {
        const msg = JSON.parse(json) as BridgeMessage;
        onMessage(msg);
      } catch (err) {
        console.error(`[host] failed to parse message: ${err instanceof Error ? err.message : String(err)}`);
        sendEvent({ type: "error", message: "Failed to parse message" });
      }
    }
  }
});

process.stdin.on("end", () => {
  // Mark that stdin has closed (Chrome disconnected).
  // Don't call process.exit(0) here — let pending async operations
  // complete naturally. The process will exit via opFinished() when
  // all pending ops are done.
  stdinEnded = true;

  // Fallback: if there's leftover data without the 4-byte prefix,
  // try to parse it as raw JSON (useful for direct pipe testing with echo).
  if (messageBuffer.length > 0) {
    try {
      const json = messageBuffer.toString("utf-8").trim();
      if (json.length > 0) {
        const msg = JSON.parse(json) as BridgeMessage;
        onMessage(msg);
      }
    } catch (err) {
      console.error(`[host] failed to parse remaining message: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // If no ops pending, exit now
  if (pendingOps === 0) {
    process.exit(0);
  }
});

// ─── Signal handling ───

process.on("SIGINT", () => {
  sendEvent({ type: "done" });
  process.exit(0);
});

process.on("SIGTERM", () => {
  sendEvent({ type: "done" });
  process.exit(0);
});

// Notify that the host is ready
console.error("[host] Native messaging host started, waiting for messages...");
