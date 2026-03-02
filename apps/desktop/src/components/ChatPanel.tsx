import { useState, useRef, useEffect, useCallback } from "react";
import { useChatStore } from "../stores/chatStore";
import type { Message, ToolCall } from "../stores/chatStore";
import { useAgent } from "../hooks/useAgent";
import { VoiceButton } from "./VoiceButton";

// ── Tool Call Display ──

function ToolCallItem({ toolCall }: { toolCall: ToolCall }) {
  const [expanded, setExpanded] = useState(false);

  const statusColor = {
    pending: "text-status-pending",
    running: "text-status-running",
    completed: "text-accent-green",
    denied: "text-status-denied",
  }[toolCall.status];

  const statusIcon = {
    pending: "\u25CB", // circle
    running: "\u25D4", // half circle
    completed: "\u2713", // check
    denied: "\u2715", // cross
  }[toolCall.status];

  return (
    <div className="mt-2 rounded-md border border-border-primary bg-bg-primary/50 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left cursor-pointer hover:bg-bg-tertiary/30 transition-colors"
      >
        <span className={`${statusColor} font-mono`}>{statusIcon}</span>
        <span className="font-mono text-accent-purple">{toolCall.name}</span>
        <span className="text-text-muted ml-auto">
          {expanded ? "\u25B4" : "\u25BE"}
        </span>
      </button>
      {expanded && (
        <div className="px-3 py-2 border-t border-border-primary text-xs space-y-2">
          <div>
            <span className="text-text-muted">Input:</span>
            <pre className="mt-1 p-2 rounded bg-bg-primary text-text-secondary font-mono text-[11px] overflow-x-auto whitespace-pre-wrap break-all">
              {JSON.stringify(toolCall.input, null, 2)}
            </pre>
          </div>
          {toolCall.result && (
            <div>
              <span className="text-text-muted">Result:</span>
              <pre className="mt-1 p-2 rounded bg-bg-primary text-text-secondary font-mono text-[11px] overflow-x-auto whitespace-pre-wrap break-all">
                {toolCall.result}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Single Message Bubble ──

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  return (
    <div
      className={`flex animate-fade-in ${
        isUser ? "justify-end" : "justify-start"
      }`}
    >
      <div
        className={`
          max-w-[80%] rounded-xl px-4 py-2.5
          ${
            isUser
              ? "bg-bg-user-bubble text-white rounded-br-sm"
              : isSystem
                ? "bg-bg-system-bubble text-text-secondary border border-border-primary rounded-bl-sm"
                : "bg-bg-assistant-bubble text-text-primary border border-border-primary rounded-bl-sm"
          }
        `}
      >
        {/* Role label for assistant/system */}
        {!isUser && (
          <div className="flex items-center gap-1.5 mb-1">
            <span
              className={`text-[10px] font-medium uppercase tracking-wider ${
                isSystem ? "text-accent-amber" : "text-accent-blue"
              }`}
            >
              {isSystem ? "System" : "ITMan"}
            </span>
          </div>
        )}

        {/* Message content */}
        <div
          className={`text-sm leading-relaxed whitespace-pre-wrap break-words ${
            isSystem ? "font-mono text-xs" : ""
          }`}
        >
          {message.content}
        </div>

        {/* Tool calls */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mt-1">
            {message.toolCalls.map((tc) => (
              <ToolCallItem key={tc.id} toolCall={tc} />
            ))}
          </div>
        )}

        {/* Timestamp */}
        <div
          className={`text-[10px] mt-1 ${
            isUser ? "text-white/50 text-right" : "text-text-muted"
          }`}
        >
          {new Date(message.timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
      </div>
    </div>
  );
}

// ── Thinking Indicator ──

function ThinkingIndicator() {
  return (
    <div className="flex justify-start animate-fade-in">
      <div className="bg-bg-assistant-bubble border border-border-primary rounded-xl rounded-bl-sm px-4 py-3">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-medium uppercase tracking-wider text-accent-blue mb-1">
            ITMan
          </span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-text-muted thinking-dot" />
          <div className="w-1.5 h-1.5 rounded-full bg-text-muted thinking-dot" />
          <div className="w-1.5 h-1.5 rounded-full bg-text-muted thinking-dot" />
        </div>
      </div>
    </div>
  );
}

// ── Chat Panel ──

export function ChatPanel() {
  const messages = useChatStore((s) => s.messages);
  const { sendMessage, isProcessing } = useAgent();

  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isProcessing]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    }
  }, [input]);

  const handleSubmit = useCallback(async () => {
    const text = input.trim();
    if (!text || isProcessing) return;
    setInput("");
    await sendMessage(text);
  }, [input, isProcessing, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleVoiceTranscript = useCallback((text: string) => {
    setInput((prev) => (prev ? prev + " " + text : text));
    textareaRef.current?.focus();
  }, []);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-text-muted">
            <div className="w-16 h-16 rounded-2xl bg-bg-secondary border border-border-primary flex items-center justify-center mb-4">
              <svg
                width="28"
                height="28"
                viewBox="0 0 28 28"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M14 2L4 7V14C4 20.08 8.38 25.72 14 27C19.62 25.72 24 20.08 24 14V7L14 2Z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  fill="none"
                />
                <path
                  d="M12 10H16V18H12V10ZM12 20H16V24H12V20Z"
                  fill="currentColor"
                  opacity="0.5"
                />
              </svg>
            </div>
            <p className="text-sm">Waiting for a session to start...</p>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto space-y-3">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            {isProcessing && <ThinkingIndicator />}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-border-primary bg-bg-secondary px-4 py-3">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-end gap-2 bg-bg-input rounded-xl border border-border-primary focus-within:border-border-focus transition-colors">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe your IT issue..."
              rows={1}
              disabled={isProcessing}
              className="flex-1 bg-transparent text-sm text-text-primary placeholder-text-muted px-4 py-2.5 resize-none outline-none min-h-[38px] max-h-[120px]"
            />
            <div className="flex items-center gap-1 pr-2 pb-1.5">
              <VoiceButton onTranscript={handleVoiceTranscript} />
              <button
                onClick={handleSubmit}
                disabled={!input.trim() || isProcessing}
                className={`
                  flex items-center justify-center w-9 h-9 rounded-lg
                  transition-all duration-200 cursor-pointer
                  ${
                    input.trim() && !isProcessing
                      ? "bg-accent-blue text-white hover:bg-accent-blue/80"
                      : "text-text-muted cursor-not-allowed"
                  }
                `}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M2 8L14 2L8 14V8H2Z"
                    fill="currentColor"
                  />
                </svg>
              </button>
            </div>
          </div>
          <p className="text-[10px] text-text-muted mt-1.5 text-center">
            Press Enter to send, Shift+Enter for new line
          </p>
        </div>
      </div>
    </div>
  );
}
