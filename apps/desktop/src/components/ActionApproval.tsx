import { useEffect, useCallback } from "react";
import { useSessionStore } from "../stores/sessionStore";
import { useChatStore } from "../stores/chatStore";
import * as commands from "../lib/tauri-commands";
import type { ApprovalRequest } from "../lib/tauri-commands";

// Try to import Tauri event listener; in non-Tauri environments this won't work
let listenFn: typeof import("@tauri-apps/api/event").listen | null = null;
try {
  // Dynamic import handled at top-level for the listener setup
  import("@tauri-apps/api/event").then((mod) => {
    listenFn = mod.listen;
  });
} catch {
  // Not in a Tauri environment
}

/** Pretty-print a tool name: snake_case -> Title Case */
function formatToolName(name: string): string {
  return name
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function ActionApproval() {
  const pendingApproval = useSessionStore((s) => s.pendingApproval);
  const setPendingApproval = useSessionStore((s) => s.setPendingApproval);
  const addMessage = useChatStore((s) => s.addMessage);

  // Listen for approval requests from the Tauri backend
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setup = async () => {
      if (!listenFn) {
        // Try importing again in case module loaded late
        try {
          const { listen } = await import("@tauri-apps/api/event");
          listenFn = listen;
        } catch {
          return;
        }
      }

      unlisten = await listenFn<ApprovalRequest>(
        "approval-request",
        (event) => {
          setPendingApproval(event.payload);
        },
      );
    };

    setup();

    return () => {
      if (unlisten) unlisten();
    };
  }, [setPendingApproval]);

  const handleApprove = useCallback(async () => {
    if (!pendingApproval) return;
    try {
      await commands.approveAction(pendingApproval.approval_id);
      addMessage({
        role: "system",
        content: `Approved: ${formatToolName(pendingApproval.tool_name)}`,
      });
    } catch (err) {
      console.error("Failed to approve action:", err);
    } finally {
      setPendingApproval(null);
    }
  }, [pendingApproval, setPendingApproval, addMessage]);

  const handleDeny = useCallback(async () => {
    if (!pendingApproval) return;
    try {
      await commands.denyAction(pendingApproval.approval_id);
      addMessage({
        role: "system",
        content: `Skipped: ${formatToolName(pendingApproval.tool_name)}`,
      });
    } catch (err) {
      console.error("Failed to deny action:", err);
    } finally {
      setPendingApproval(null);
    }
  }, [pendingApproval, setPendingApproval, addMessage]);

  // Handle Escape key to deny
  useEffect(() => {
    if (!pendingApproval) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleDeny();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [pendingApproval, handleDeny]);

  if (!pendingApproval) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg-overlay backdrop-blur-sm animate-fade-in">
      <div className="bg-bg-secondary border border-border-primary rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-5 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent-amber/15 flex items-center justify-center">
              <svg
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M10 2L1 18H19L10 2Z"
                  stroke="#f59e0b"
                  strokeWidth="1.5"
                  fill="none"
                />
                <path d="M9 8H11V12H9V8ZM9 14H11V16H9V14Z" fill="#f59e0b" />
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-text-primary">
                Action Requires Approval
              </h2>
              <p className="text-xs text-text-secondary mt-0.5">
                The assistant wants to perform the following action:
              </p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-3">
          {/* Tool name */}
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs text-text-muted">Tool:</span>
            <span className="px-2 py-0.5 rounded-md bg-accent-purple/15 text-accent-purple text-xs font-mono">
              {pendingApproval.tool_name}
            </span>
          </div>

          {/* Description */}
          <p className="text-sm text-text-primary mb-3">
            {pendingApproval.description}
          </p>

          {/* Parameters */}
          {Object.keys(pendingApproval.parameters).length > 0 && (
            <div className="rounded-lg bg-bg-primary border border-border-primary p-3">
              <span className="text-[10px] uppercase tracking-wider text-text-muted font-medium">
                Parameters
              </span>
              <pre className="mt-1.5 text-xs text-text-secondary font-mono whitespace-pre-wrap break-all">
                {JSON.stringify(pendingApproval.parameters, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-6 py-4 flex items-center justify-end gap-3 border-t border-border-primary">
          <button
            onClick={handleDeny}
            className="px-4 py-2 rounded-lg text-sm text-text-secondary bg-bg-tertiary hover:bg-bg-tertiary/80 transition-colors cursor-pointer"
          >
            Skip
          </button>
          <button
            onClick={handleApprove}
            className="px-4 py-2 rounded-lg text-sm text-white bg-accent-green hover:bg-accent-green/80 transition-colors cursor-pointer"
          >
            Approve
          </button>
        </div>
      </div>
    </div>
  );
}
