import { create } from "zustand";
import type {
  ApprovalRequest,
  ChangeEntry,
  SessionRecord,
} from "../lib/tauri-commands";

type ActiveView = "chat" | "knowledge" | "diagnostics";
export type SessionMode = "default" | "learn";

export interface PlaybookStep {
  number: number;
  label: string;
}

interface SessionState {
  sessionId: string | null;
  isActive: boolean;
  /** Session mode: "default" for normal chat, "learn" for knowledge-creation flow. */
  sessionMode: SessionMode;
  /** Session ID currently being processed by the LLM (null if idle). */
  processingSessionId: string | null;
  /** When true, RUN_STEP actions auto-confirm without user interaction. */
  autoRun: boolean;
  /** Steps from the active playbook (populated on playbook_activated event). */
  playbookSteps: PlaybookStep[];
  changes: ChangeEntry[];
  pendingApproval: ApprovalRequest | null;
  changeLogOpen: boolean;
  historyOpen: boolean;
  knowledgeOpen: boolean;
  settingsOpen: boolean;
  sidebarOpen: boolean;
  activeView: ActiveView;
  pastSessions: SessionRecord[];

  setSession: (id: string) => void;
  setSessionMode: (mode: SessionMode) => void;
  endSession: () => void;
  setProcessingSession: (id: string | null) => void;
  setAutoRun: (on: boolean) => void;
  setPlaybookSteps: (steps: PlaybookStep[]) => void;
  addChange: (change: ChangeEntry) => void;
  markChangeUndone: (changeId: string) => void;
  setChanges: (changes: ChangeEntry[]) => void;
  setPendingApproval: (req: ApprovalRequest | null) => void;
  toggleChangeLog: () => void;
  setChangeLogOpen: (open: boolean) => void;
  toggleHistory: () => void;
  setHistoryOpen: (open: boolean) => void;
  toggleKnowledge: () => void;
  setKnowledgeOpen: (open: boolean) => void;
  toggleSettings: () => void;
  setSettingsOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setActiveView: (view: ActiveView) => void;
  setPastSessions: (sessions: SessionRecord[]) => void;
  /** Add a session to the top of pastSessions (optimistic insert). */
  prependSession: (session: SessionRecord) => void;
}

// Helper: close all side panels.
const allPanelsClosed = {
  changeLogOpen: false,
  historyOpen: false,
  knowledgeOpen: false,
  settingsOpen: false,
};

export const useSessionStore = create<SessionState>((set) => ({
  sessionId: null,
  isActive: false,
  sessionMode: "default",
  processingSessionId: null,
  autoRun: false,
  playbookSteps: [],
  changes: [],
  pendingApproval: null,
  changeLogOpen: false,
  historyOpen: false,
  knowledgeOpen: false,
  settingsOpen: false,
  sidebarOpen: true,
  activeView: "chat",
  pastSessions: [],

  setSession: (id) =>
    set({
      sessionId: id,
      isActive: true,
      sessionMode: "default",
      autoRun: false,
      playbookSteps: [],
      changes: [],
      pendingApproval: null,
    }),

  setSessionMode: (mode) => set({ sessionMode: mode }),

  endSession: () =>
    set({
      isActive: false,
      sessionMode: "default",
      autoRun: false,
      playbookSteps: [],
      pendingApproval: null,
    }),

  setProcessingSession: (id) => set({ processingSessionId: id }),

  setAutoRun: (on) => set({ autoRun: on }),

  setPlaybookSteps: (steps) => set({ playbookSteps: steps }),

  addChange: (change) =>
    set((state) => ({
      changes: [...state.changes, change],
    })),

  markChangeUndone: (changeId) =>
    set((state) => ({
      changes: state.changes.map((c) =>
        c.id === changeId ? { ...c, undone: true } : c,
      ),
    })),

  setChanges: (changes) => set({ changes }),

  setPendingApproval: (req) => set({ pendingApproval: req }),

  // Panels are mutually exclusive — opening one closes the others.
  toggleChangeLog: () =>
    set((state) => ({
      ...allPanelsClosed,
      changeLogOpen: !state.changeLogOpen,
    })),

  setChangeLogOpen: (open) =>
    set(open ? { ...allPanelsClosed, changeLogOpen: true } : { changeLogOpen: false }),

  toggleHistory: () =>
    set((state) => ({
      ...allPanelsClosed,
      historyOpen: !state.historyOpen,
    })),

  setHistoryOpen: (open) =>
    set(open ? { ...allPanelsClosed, historyOpen: true } : { historyOpen: false }),

  toggleKnowledge: () =>
    set((state) => ({
      ...allPanelsClosed,
      knowledgeOpen: !state.knowledgeOpen,
    })),

  setKnowledgeOpen: (open) =>
    set(open ? { ...allPanelsClosed, knowledgeOpen: true } : { knowledgeOpen: false }),

  toggleSettings: () =>
    set((state) => ({
      ...allPanelsClosed,
      settingsOpen: !state.settingsOpen,
    })),

  setSettingsOpen: (open) =>
    set(open ? { ...allPanelsClosed, settingsOpen: true } : { settingsOpen: false }),

  toggleSidebar: () =>
    set((state) => ({ sidebarOpen: !state.sidebarOpen })),

  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  setActiveView: (view) => set({ activeView: view }),

  setPastSessions: (sessions) => set({ pastSessions: sessions }),

  prependSession: (session) =>
    set((state) => ({
      pastSessions: [session, ...state.pastSessions.filter((s) => s.id !== session.id)],
    })),
}));
