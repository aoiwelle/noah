import { useCallback, useRef, useEffect } from "react";
import { useChatStore } from "../stores/chatStore";
import { useSessionStore } from "../stores/sessionStore";
import * as commands from "../lib/tauri-commands";
import type { UserEventType, AssistantUiPayload } from "../lib/tauri-commands";

interface UseAgentReturn {
  sendMessage: (text: string) => Promise<void>;
  sendConfirmation: (messageId: string, actionLabel?: string) => Promise<void>;
  sendEvent: (eventType: UserEventType, payload?: string) => Promise<void>;
  cancelProcessing: () => Promise<void>;
  isProcessing: boolean;
}

/** Strip "Agent error: " prefix from backend errors since we already show friendly messages. */
function cleanError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return raw.replace(/^Agent error:\s*/i, "");
}

/** Check if a response should be auto-confirmed (autoRun + RUN_STEP). */
function shouldAutoConfirm(ui: AssistantUiPayload | undefined): boolean {
  if (!useSessionStore.getState().autoRun) return false;
  if (ui?.kind !== "spa") return false;
  return ui.action?.type === "RUN_STEP";
}

export function useAgent(): UseAgentReturn {
  const addMessage = useChatStore((s) => s.addMessage);
  const updateMessage = useChatStore((s) => s.updateMessage);
  const markActionTaken = useChatStore((s) => s.markActionTaken);
  const sessionId = useSessionStore((s) => s.sessionId);
  const processingSessionId = useSessionStore((s) => s.processingSessionId);
  const setProcessingSession = useSessionStore((s) => s.setProcessingSession);
  const setChanges = useSessionStore((s) => s.setChanges);
  const changes = useSessionStore((s) => s.changes);

  // Only show processing indicator when the current session matches the processing one.
  const isProcessing = processingSessionId !== null && processingSessionId === sessionId;

  // Ref to hold sendConfirmation so it can be called recursively from auto-run.
  const confirmRef = useRef<(messageId: string, actionLabel?: string) => Promise<void>>(undefined);

  /** Shared post-response handler: sync changes, then auto-confirm if needed. */
  const handleResponse = useCallback(
    async (prevChangeIds: Set<string>) => {
      try {
        const updatedChanges = await commands.getChanges(useSessionStore.getState().sessionId!);
        setChanges(updatedChanges);
        const newChangeIds = updatedChanges
          .filter((c) => !prevChangeIds.has(c.id))
          .map((c) => c.id);
        if (newChangeIds.length > 0) {
          const latestMsgs = useChatStore.getState().messages;
          const lastAssistant = latestMsgs[latestMsgs.length - 1];
          if (lastAssistant?.role === "assistant") {
            updateMessage(lastAssistant.id, { changeIds: newChangeIds });
          }
        }
      } catch {
        // best-effort
      }
    },
    [setChanges, updateMessage],
  );

  /** Try to auto-confirm if autoRun is active and the response is RUN_STEP. */
  const maybeAutoConfirm = useCallback(
    async (ui: AssistantUiPayload | undefined) => {
      if (!shouldAutoConfirm(ui)) return;
      const spaUi = ui as import("../lib/tauri-commands").AssistantUiSpa;
      const msgs = useChatStore.getState().messages;
      const lastMsg = msgs[msgs.length - 1];
      if (lastMsg?.role === "assistant" && !lastMsg.actionTaken) {
        // Brief pause so the user can see the card before it auto-advances.
        await new Promise((r) => setTimeout(r, 400));
        // Re-check: user might have hit stop.
        if (useSessionStore.getState().autoRun && confirmRef.current) {
          confirmRef.current(lastMsg.id, spaUi.action.label);
        }
      }
    },
    [],
  );

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || !sessionId) return;

      const prevChangeIds = new Set(changes.map((c) => c.id));

      addMessage({ role: "user", content: trimmed });
      setProcessingSession(sessionId);

      try {
        const result = await commands.sendMessageV2(sessionId, trimmed);
        addMessage({
          role: "assistant",
          content: result.text,
          assistantUi: result.assistant_ui,
        });

        await handleResponse(prevChangeIds);
        await maybeAutoConfirm(result.assistant_ui);
      } catch (err) {
        console.error("Agent communication error:", err);
        addMessage({
          role: "system",
          content: cleanError(err),
        });
      } finally {
        setProcessingSession(null);
      }
    },
    [sessionId, addMessage, setProcessingSession, changes, handleResponse, maybeAutoConfirm],
  );

  const sendConfirmation = useCallback(
    async (messageId: string, actionLabel?: string) => {
      if (!sessionId) return;

      const prevChangeIds = new Set(changes.map((c) => c.id));

      const confirmText = actionLabel || "Go ahead";
      markActionTaken(messageId);
      addMessage({
        role: "user",
        content: confirmText,
      });
      setProcessingSession(sessionId);

      try {
        const result = await commands.sendMessageV2(
          sessionId,
          confirmText,
          true,
        );
        addMessage({
          role: "assistant",
          content: result.text,
          assistantUi: result.assistant_ui,
        });

        await handleResponse(prevChangeIds);
        await maybeAutoConfirm(result.assistant_ui);
      } catch (err) {
        console.error("Agent communication error:", err);
        addMessage({
          role: "system",
          content: cleanError(err),
        });
      } finally {
        setProcessingSession(null);
      }
    },
    [sessionId, addMessage, markActionTaken, setProcessingSession, changes, handleResponse, maybeAutoConfirm],
  );

  // Keep the ref updated so maybeAutoConfirm can call it.
  useEffect(() => {
    confirmRef.current = sendConfirmation;
  }, [sendConfirmation]);

  const sendEvent = useCallback(
    async (eventType: UserEventType, payload?: string) => {
      if (!sessionId) return;

      // Show the user's answer in the chat — transparency: what user said = what LLM sees
      if (eventType === "USER_ANSWER_QUESTION" && payload) {
        try {
          const parsed = JSON.parse(payload);
          const answer = parsed.answer || parsed.answers?.toString() || "";
          if (answer) {
            addMessage({ role: "user", content: answer });
          }
        } catch { /* best-effort */ }
      }

      setProcessingSession(sessionId);
      try {
        const result = await commands.sendUserEvent(
          sessionId,
          eventType,
          payload,
        );
        addMessage({
          role: "assistant",
          content: result.text,
          assistantUi: result.assistant_ui,
        });
      } catch (err) {
        console.error("Agent communication error:", err);
        addMessage({
          role: "system",
          content: cleanError(err),
        });
      } finally {
        setProcessingSession(null);
      }
    },
    [sessionId, addMessage, setProcessingSession],
  );

  const cancelProcessing = useCallback(async () => {
    // Also stop auto-run when user cancels.
    useSessionStore.getState().setAutoRun(false);
    try {
      await commands.cancelProcessing();
    } catch (err) {
      console.error("Failed to cancel:", err);
    }
  }, []);

  return { sendMessage, sendConfirmation, sendEvent, cancelProcessing, isProcessing };
}
