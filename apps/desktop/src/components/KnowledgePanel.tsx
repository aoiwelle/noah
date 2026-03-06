import { useState, useEffect, useCallback } from "react";
import { useSessionStore } from "../stores/sessionStore";
import * as commands from "../lib/tauri-commands";
import type { KnowledgeEntry } from "../lib/tauri-commands";

function KnowledgeItem({
  entry,
  onSelect,
  onDelete,
}: {
  entry: KnowledgeEntry;
  onSelect: (path: string) => void;
  onDelete: (path: string) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="border-b border-border-primary last:border-b-0">
      <button
        onClick={() => onSelect(entry.path)}
        className="w-full px-4 py-2.5 text-left hover:bg-bg-tertiary/50 transition-colors cursor-pointer"
      >
        <p className="text-sm text-text-primary leading-snug truncate">
          {entry.title}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] text-text-muted font-mono">
            {entry.path}
          </span>
          <span className="ml-auto">
            {confirmDelete ? (
              <>
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(entry.path);
                    setConfirmDelete(false);
                  }}
                  className="text-[10px] text-accent-red font-medium cursor-pointer"
                >
                  Confirm
                </span>
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmDelete(false);
                  }}
                  className="text-[10px] text-text-muted cursor-pointer ml-2"
                >
                  Cancel
                </span>
              </>
            ) : (
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmDelete(true);
                }}
                className="text-[10px] text-text-muted hover:text-accent-red transition-colors cursor-pointer"
              >
                Delete
              </span>
            )}
          </span>
        </div>
      </button>
    </div>
  );
}

export function KnowledgePanel() {
  const knowledgeOpen = useSessionStore((s) => s.knowledgeOpen);
  const setKnowledgeOpen = useSessionStore((s) => s.setKnowledgeOpen);

  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>("");

  const loadEntries = useCallback(async () => {
    try {
      const result = await commands.listKnowledge();
      setEntries(result);
    } catch (err) {
      console.error("Failed to load knowledge:", err);
    }
  }, []);

  useEffect(() => {
    if (knowledgeOpen) {
      loadEntries();
      setSelectedPath(null);
    }
  }, [knowledgeOpen, loadEntries]);

  const handleSelect = useCallback(async (path: string) => {
    try {
      const content = await commands.readKnowledgeFile(path);
      setFileContent(content);
      setSelectedPath(path);
    } catch (err) {
      console.error("Failed to read knowledge file:", err);
    }
  }, []);

  const handleDelete = useCallback(
    async (path: string) => {
      try {
        await commands.deleteKnowledgeFile(path);
        setEntries(entries.filter((e) => e.path !== path));
        if (selectedPath === path) {
          setSelectedPath(null);
        }
      } catch (err) {
        console.error("Failed to delete knowledge file:", err);
      }
    },
    [entries, selectedPath],
  );

  const handleBack = useCallback(() => {
    setSelectedPath(null);
  }, []);

  if (!knowledgeOpen) return null;

  // Group entries by category.
  const grouped: Record<string, KnowledgeEntry[]> = {};
  for (const entry of entries) {
    if (!grouped[entry.category]) {
      grouped[entry.category] = [];
    }
    grouped[entry.category].push(entry);
  }
  const categories = Object.keys(grouped).sort();

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-30 bg-black/20"
        onClick={() => setKnowledgeOpen(false)}
      />

      {/* Slide-out panel */}
      <div className="fixed top-0 right-0 bottom-0 z-40 w-80 bg-bg-secondary border-l border-border-primary shadow-2xl flex flex-col animate-slide-in-right">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-primary">
          {selectedPath ? (
            <>
              <button
                onClick={handleBack}
                className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors cursor-pointer"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M9 3L5 7L9 11"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Back
              </button>
              <button
                onClick={() => setKnowledgeOpen(false)}
                className="w-7 h-7 rounded-md flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors cursor-pointer"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M3 3L11 11M11 3L3 11"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </>
          ) : (
            <>
              <h2 className="text-sm font-semibold text-text-primary">
                Knowledge
              </h2>
              <button
                onClick={() => setKnowledgeOpen(false)}
                className="w-7 h-7 rounded-md flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors cursor-pointer"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M3 3L11 11M11 3L3 11"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {selectedPath ? (
            /* Detail view */
            <div className="px-4 py-3">
              <p className="text-[10px] text-text-muted font-mono mb-3">
                {selectedPath}
              </p>
              <pre className="text-sm text-text-primary whitespace-pre-wrap break-words leading-relaxed font-sans">
                {fileContent}
              </pre>
            </div>
          ) : entries.length === 0 ? (
            /* Empty state */
            <div className="flex flex-col items-center justify-center h-full text-text-muted px-4">
              <svg
                width="32"
                height="32"
                viewBox="0 0 32 32"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="mb-3 opacity-50"
              >
                <path
                  d="M6 4H20L26 10V28H6V4Z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
                <path
                  d="M20 4V10H26"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
                <path
                  d="M10 16H22M10 20H22M10 24H18"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
              <p className="text-xs text-center">
                Noah hasn't learned anything about your system yet.
                <br />
                Knowledge will build up as you use the app.
              </p>
            </div>
          ) : (
            /* Tree view */
            <div>
              {categories.map((cat) => (
                <div key={cat}>
                  <div className="px-4 py-2 text-[10px] font-medium uppercase tracking-wider text-text-muted bg-bg-primary/50 border-b border-border-primary">
                    {cat}
                  </div>
                  {grouped[cat].map((entry) => (
                    <KnowledgeItem
                      key={entry.path}
                      entry={entry}
                      onSelect={handleSelect}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {!selectedPath && entries.length > 0 && (
          <div className="px-4 py-2.5 border-t border-border-primary">
            <p className="text-[10px] text-text-muted">
              {entries.length} file{entries.length !== 1 ? "s" : ""} across{" "}
              {categories.length} categor{categories.length !== 1 ? "ies" : "y"}
            </p>
          </div>
        )}
      </div>
    </>
  );
}
