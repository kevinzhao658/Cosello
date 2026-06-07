import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { ModalShell } from "./ui/ModalShell";
import { SkeletonImage } from "./ui/SkeletonImage";
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
  // Prefer the persistent Supabase URL (from state.segmentation.image_urls) —
  // iOS Safari can have trouble rendering blob URLs from IDB-stored blobs.
  const previewUrls = useMemo(() => {
    const map = new Map<string, string>();
    for (const draft of drafts) {
      const serverUrl = draft.state.segmentation?.image_urls?.[0];
      if (serverUrl) {
        map.set(draft.id, serverUrl);
        continue;
      }
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
  const hasDrafts = drafts.length > 0;

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

      {/* Drafts header (only when drafts exist) */}
      {hasDrafts && (
        <div className="flex items-baseline justify-between">
          <h2 className="text-[10px] font-bold text-muted">Drafts</h2>
          <span className="text-[10px] text-muted-soft">
            {drafts.length} in progress
          </span>
        </div>
      )}

      {/* Draft cards (top section) */}
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
            <div className="relative size-16 shrink-0 rounded-md border border-hairline overflow-hidden">
              <SkeletonImage src={previewUrls.get(draft.id) ?? null} alt="" />
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

      {/* Divider between drafts and the "Start new" CTA */}
      {hasDrafts && <hr className="border-t border-hairline my-2" />}

      {/* Start-new-listing CTA — card style, always at the bottom */}
      <button
        type="button"
        onClick={onStartNew}
        className={`w-full flex items-center gap-3 rounded-md border border-hairline bg-surface-soft hover:bg-canvas hover:border-ink transition-colors p-4 text-left ${FOCUS_RING}`}
      >
        <div className="size-10 shrink-0 rounded-full bg-ink text-on-primary flex items-center justify-center">
          <Plus className="size-4" strokeWidth={2.5} aria-hidden />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-ink">Start a new listing</div>
          <div className="text-[11.5px] text-muted truncate">
            Upload photos to begin a draft
          </div>
        </div>
      </button>

      {/* Empty-state hint (only when truly empty + available) */}
      {!hasDrafts && !loading && available !== false && userId && (
        <p className="text-xs text-muted-soft text-center">
          Drafts save automatically as you work.
        </p>
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
