import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "./ui/button";
import { ModalShell } from "./ui/ModalShell";
import * as draftStorage from "../lib/draftStorage";
import type { Draft } from "../lib/draftStorage";

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas";

// Top-3 visible by default. Expand to show all.
const DEFAULT_VISIBLE_COUNT = 3;

export interface DraftsGalleryProps {
  userId: string | null;        // null when logged out
  onSelectDraft: (id: string) => void;
  onStartNew: () => void;
  // Bumped by the parent when a draft has just been saved/deleted, so the
  // gallery re-fetches. Simpler than wiring an event bus.
  refreshNonce?: number;
}

function relativeTime(ms: number): string {
  const diff = Math.max(0, Date.now() - ms);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day === 1) return "yesterday";
  if (day < 7) return `${day}d ago`;
  return new Date(ms).toLocaleDateString();
}

function draftTitle(draft: Draft): string {
  if (draft.mode === "bulk" && draft.state.bulkItems.length > 0) {
    return `Bulk · ${draft.state.bulkItems.length} items`;
  }
  const brand = draft.state.productDetails?.brand?.trim() ?? "";
  const name = draft.state.productDetails?.name?.trim() ?? "";
  const title = [brand, name].filter(Boolean).join(" ");
  if (title) return title;
  const photoCount = draft.files.length;
  return `Untitled · ${photoCount} photo${photoCount === 1 ? "" : "s"}`;
}

export function DraftsGallery({
  userId,
  onSelectDraft,
  onStartNew,
  refreshNonce,
}: DraftsGalleryProps) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Generate preview URLs for the first file of each draft. Revoke on unmount.
  const previewUrls = useMemo(() => {
    const map = new Map<string, string>();
    for (const draft of drafts) {
      const first = draft.files[0];
      if (first) {
        try {
          const file = new File([first.blob], first.name, { type: first.type });
          map.set(draft.id, URL.createObjectURL(file));
        } catch {
          // skip — thumbnail will fall back to a placeholder
        }
      }
    }
    return map;
  }, [drafts]);
  useEffect(() => {
    return () => {
      for (const url of previewUrls.values()) URL.revokeObjectURL(url);
    };
  }, [previewUrls]);

  const refresh = useCallback(async () => {
    if (!userId) {
      setDrafts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const ok = await draftStorage.isAvailable();
    setAvailable(ok);
    if (!ok) {
      setDrafts([]);
      setLoading(false);
      return;
    }
    const list = await draftStorage.listDrafts(userId);
    setDrafts(list);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshNonce]);

  const handleDelete = useCallback(async (id: string) => {
    await draftStorage.deleteDraft(id);
    setConfirmDeleteId(null);
    void refresh();
  }, [refresh]);

  const hasQuotaError = drafts.some((d) => d.lastSaveError === "quota");
  const visibleDrafts = expanded ? drafts : drafts.slice(0, DEFAULT_VISIBLE_COUNT);
  const overflow = drafts.length - DEFAULT_VISIBLE_COUNT;

  return (
    <div className="max-w-3xl mx-auto space-y-4 px-4 py-6">
      {/* Storage banner — quota errors */}
      {hasQuotaError && (
        <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-3 text-sm">
          <AlertTriangle className="size-4 shrink-0 text-warning mt-0.5" aria-hidden />
          <span>
            Storage is full on this device. Delete some drafts below to free up space.
          </span>
        </div>
      )}

      {/* Private-browsing banner */}
      {available === false && (
        <div className="flex items-start gap-2 rounded-md border border-hairline bg-surface-soft px-3 py-3 text-sm text-muted">
          <AlertTriangle className="size-4 shrink-0 text-muted mt-0.5" aria-hidden />
          <span>
            Drafts can't be saved in private browsing. Switch to a regular window to enable drafts.
          </span>
        </div>
      )}

      {/* Header */}
      {drafts.length > 0 && (
        <div className="flex items-baseline justify-between">
          <h1 className="text-xl font-extrabold tracking-tight text-ink">Drafts</h1>
          <span className="text-xs text-muted">{drafts.length} in progress</span>
        </div>
      )}

      {/* Start new listing CTA */}
      <Button
        onClick={onStartNew}
        className={`w-full justify-center ${FOCUS_RING}`}
      >
        <Plus className="size-4" aria-hidden />
        Start a new listing
      </Button>

      {/* Empty-state hint */}
      {drafts.length === 0 && !loading && available !== false && userId && (
        <p className="text-xs text-muted-soft text-center">
          Drafts save automatically as you work.
        </p>
      )}

      {/* Draft cards */}
      {visibleDrafts.map((draft) => (
        <div
          key={draft.id}
          className="flex items-stretch gap-3 rounded-md border border-hairline bg-canvas overflow-hidden hover:bg-surface-soft transition-colors"
        >
          <button
            type="button"
            onClick={() => onSelectDraft(draft.id)}
            className={`flex flex-1 items-center gap-3 p-3 text-left min-w-0 ${FOCUS_RING}`}
          >
            <div className="size-16 shrink-0 rounded-md bg-surface-soft border border-hairline overflow-hidden">
              {previewUrls.get(draft.id) ? (
                <img
                  src={previewUrls.get(draft.id)}
                  alt=""
                  className="size-full object-cover"
                />
              ) : null}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-ink truncate">{draftTitle(draft)}</div>
              <div className="text-xs text-muted truncate">
                {draft.mode === "single" ? "Single" : "Bulk"} · {relativeTime(draft.updatedAt)}
              </div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setConfirmDeleteId(draft.id)}
            aria-label="Delete draft"
            className={`shrink-0 px-3 text-muted hover:text-error ${FOCUS_RING}`}
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      ))}

      {/* View all / Show less toggle */}
      {overflow > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className={`w-full inline-flex items-center justify-center gap-1.5 py-2 text-sm text-muted hover:text-ink ${FOCUS_RING}`}
        >
          {expanded ? (
            <>
              <ChevronUp className="size-4" aria-hidden />
              Show less
            </>
          ) : (
            <>
              <ChevronDown className="size-4" aria-hidden />
              View all ({overflow} more)
            </>
          )}
        </button>
      )}

      {/* Delete-confirm modal */}
      {confirmDeleteId && (
        <ModalShell
          open
          onClose={() => setConfirmDeleteId(null)}
          z={60}
        >
          <div className="bg-canvas border border-hairline rounded-md max-w-sm w-full mx-4 p-6 shadow-overlay">
            <h3 className="text-base font-semibold text-ink mb-2">Delete this draft?</h3>
            <p className="text-sm text-body leading-relaxed">
              This can't be undone.
            </p>
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => setConfirmDeleteId(null)}
                className={`h-9 px-4 rounded-md border border-border-strong text-ink bg-canvas hover:bg-surface-soft text-sm font-semibold ${FOCUS_RING}`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleDelete(confirmDeleteId)}
                className={`h-9 px-4 rounded-md bg-error text-on-primary hover:bg-error/90 text-sm font-semibold ${FOCUS_RING}`}
              >
                Delete
              </button>
            </div>
          </div>
        </ModalShell>
      )}
    </div>
  );
}
