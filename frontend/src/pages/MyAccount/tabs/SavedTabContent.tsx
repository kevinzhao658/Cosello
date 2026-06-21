import { Plus, Loader2, Pencil, Trash2, Check, ChevronDown } from "lucide-react";
import { ListingImage } from "../../../components/ui/ListingImage";
import { ListingCardSkeleton } from "../../../components/ListingCardSkeleton";
import { Tooltip } from "../../../components/ui/tooltip";
import { formatTitle } from "../../../lib/format";
import { PLACEHOLDER_COMMUNITY } from "../../../lib/listings";
import { FOCUS_RING } from "../constants";
import type { Listing } from "../../../lib/types";

interface WishlistFolder {
  id: number;
  name: string;
  item_count: number;
}

interface WishlistListingWithFolder extends Listing {
  folder_id?: number | null;
}

export interface SavedTabContentProps {
  folders: WishlistFolder[];
  foldersAvailable: boolean;
  items: WishlistListingWithFolder[] | Listing[];
  isLoadingSaved: boolean;
  selectedFolderId: number | "all";
  setSelectedFolderId: (id: number | "all") => void;
  selectedIds: Set<string>;
  setSelectedIds: (ids: Set<string>) => void;
  newFolderOpen: boolean;
  setNewFolderOpen: (v: boolean) => void;
  newFolderName: string;
  setNewFolderName: (v: string) => void;
  creatingFolder: boolean;
  createFolder: () => void;
  renamingFolderId: number | null;
  setRenamingFolderId: (id: number | null) => void;
  renamingFolderName: string;
  setRenamingFolderName: (v: string) => void;
  savingFolderId: number | null;
  renameFolder: (id: number) => void;
  deleteFolder: (id: number) => void;
  moveSelectedToFolder: (folderId: number | null) => void;
  unsaveSelected: () => void;
  moveOpen: boolean;
  setMoveOpen: (v: boolean) => void;
  openListingDetail?: (l: Listing) => void;
  wishlistItemsWithFolder: WishlistListingWithFolder[];
  onNavigate: (page: string) => void;
}

function Heart({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.84 4.6a5.5 5.5 0 0 0-7.78 0L12 5.7l-1.06-1.1a5.5 5.5 0 0 0-7.78 7.78L12 21l8.84-8.62a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

function FolderIcon({ className, filled }: { className?: string; filled?: boolean }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

export function SavedTabContent({
  folders,
  foldersAvailable,
  items,
  isLoadingSaved,
  selectedFolderId,
  setSelectedFolderId,
  selectedIds,
  setSelectedIds,
  newFolderOpen,
  setNewFolderOpen,
  newFolderName,
  setNewFolderName,
  creatingFolder,
  createFolder,
  renamingFolderId,
  setRenamingFolderId,
  renamingFolderName,
  setRenamingFolderName,
  savingFolderId,
  renameFolder,
  deleteFolder,
  moveSelectedToFolder,
  unsaveSelected,
  moveOpen,
  setMoveOpen,
  openListingDetail,
  wishlistItemsWithFolder,
  onNavigate,
}: SavedTabContentProps) {
  const totalCount = wishlistItemsWithFolder.length > 0 ? wishlistItemsWithFolder.length : items.length;
  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };
  const selectAll = () => setSelectedIds(new Set(items.map((i) => i.id)));
  const clearSel = () => setSelectedIds(new Set());

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-6">
      <aside className="space-y-1">
        <h3 className="text-[11px] text-muted px-2 pb-1">Collections</h3>
        {!foldersAvailable && (
          <div className="px-3 py-2 mb-2 rounded-md bg-warning/10 border border-warning/20 text-[11px] text-body">
            Folders coming soon — backend in progress.
          </div>
        )}
        <button
          onClick={() => setSelectedFolderId("all")}
          className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${FOCUS_RING} ${
            selectedFolderId === "all" ? "bg-primary-soft text-primary font-semibold" : "text-body hover:bg-surface-soft"
          }`}
        >
          <Heart className="size-3.5 shrink-0" />
          <span className="flex-1 text-left truncate">All saved</span>
          <span className="text-[11px] text-muted">{totalCount}</span>
        </button>
        {foldersAvailable && folders.map((f) => {
          const active = selectedFolderId === f.id;
          const isRenaming = renamingFolderId === f.id;
          return (
            <div key={f.id} className="group relative">
              {isRenaming ? (
                <div className="flex items-center gap-1.5 px-2 py-1.5">
                  <input
                    value={renamingFolderName}
                    onChange={(e) => setRenamingFolderName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") renameFolder(f.id);
                      if (e.key === "Escape") setRenamingFolderId(null);
                    }}
                    autoFocus
                    className={`flex-1 h-7 px-2 rounded-md border border-hairline bg-canvas text-sm text-ink ${FOCUS_RING}`}
                  />
                  <button
                    onClick={() => renameFolder(f.id)}
                    disabled={savingFolderId === f.id}
                    className={`h-7 px-2 rounded-md bg-primary text-on-primary text-[11px] font-semibold disabled:opacity-50 ${FOCUS_RING}`}
                  >
                    {savingFolderId === f.id ? <Loader2 className="size-3 animate-spin" /> : "Save"}
                  </button>
                  <button
                    onClick={() => setRenamingFolderId(null)}
                    className={`h-7 px-2 rounded-md text-muted hover:text-ink text-[11px] ${FOCUS_RING}`}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setSelectedFolderId(f.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${FOCUS_RING} ${
                    active ? "bg-primary-soft text-primary font-semibold" : "text-body hover:bg-surface-soft"
                  }`}
                >
                  <FolderIcon className="size-3.5 shrink-0" filled={active} />
                  <span className="flex-1 text-left truncate">{f.name}</span>
                  <span className="text-[11px] text-muted">{f.item_count}</span>
                </button>
              )}
              {!isRenaming && (
                <div className="absolute right-2 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-0.5 bg-canvas border border-hairline rounded-md shadow-card">
                  <Tooltip content="Rename folder">
                    <button
                      onClick={(e) => { e.stopPropagation(); setRenamingFolderId(f.id); setRenamingFolderName(f.name); }}
                      className={`size-7 inline-flex items-center justify-center text-muted hover:text-ink rounded-md ${FOCUS_RING}`}
                      aria-label="Rename folder"
                    >
                      <Pencil className="size-3" />
                    </button>
                  </Tooltip>
                  <Tooltip content="Delete folder">
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteFolder(f.id); }}
                      className={`size-7 inline-flex items-center justify-center text-muted hover:text-error rounded-md ${FOCUS_RING}`}
                      aria-label="Delete folder"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </Tooltip>
                </div>
              )}
            </div>
          );
        })}
        {foldersAvailable && (
          newFolderOpen ? (
            <div className="px-2 py-1.5 mt-1 border border-dashed border-hairline rounded-md">
              <input
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") createFolder();
                  if (e.key === "Escape") { setNewFolderOpen(false); setNewFolderName(""); }
                }}
                placeholder="Folder name"
                autoFocus
                className={`w-full h-8 px-2 rounded-md border border-hairline bg-canvas text-sm text-ink ${FOCUS_RING}`}
              />
              <div className="flex items-center gap-1.5 mt-1.5">
                <button
                  onClick={createFolder}
                  disabled={!newFolderName.trim() || creatingFolder}
                  className={`flex-1 h-7 rounded-md bg-primary text-on-primary text-[11px] font-semibold disabled:opacity-50 ${FOCUS_RING}`}
                >
                  {creatingFolder ? <Loader2 className="size-3 animate-spin mx-auto" /> : "Create"}
                </button>
                <button
                  onClick={() => { setNewFolderOpen(false); setNewFolderName(""); }}
                  className={`flex-1 h-7 rounded-md text-muted hover:text-ink text-[11px] ${FOCUS_RING}`}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setNewFolderOpen(true)}
              className={`w-full flex items-center gap-2 px-3 py-2 mt-2 rounded-md text-sm text-muted hover:text-ink border border-dashed border-hairline hover:border-border-strong transition-colors ${FOCUS_RING}`}
            >
              <Plus className="size-3.5" />
              <span className="flex-1 text-left">New folder</span>
            </button>
          )
        )}
      </aside>

      <div>
        {selectedIds.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-4 px-4 py-2 bg-surface-soft border border-hairline rounded-md">
            <span className="text-sm font-semibold text-ink">{selectedIds.size} selected</span>
            <div className="flex-1" />
            {foldersAvailable && folders.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setMoveOpen(!moveOpen)}
                  className={`inline-flex items-center gap-1 h-8 px-3 rounded-md bg-primary text-on-primary text-xs font-semibold hover:bg-primary-hover transition-colors ${FOCUS_RING}`}
                >
                  Add to folder
                  <ChevronDown className="size-3" />
                </button>
                {moveOpen && (
                  <div role="menu" className="absolute right-0 top-full mt-1 w-48 bg-canvas border border-hairline rounded-md shadow-overlay overflow-hidden z-10">
                    {folders.map((f) => (
                      <button
                        key={f.id}
                        role="menuitem"
                        onClick={() => moveSelectedToFolder(f.id)}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-body hover:bg-surface-soft hover:text-ink text-left ${FOCUS_RING}`}
                      >
                        <FolderIcon className="size-3.5" />
                        <span className="flex-1 truncate">{f.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {foldersAvailable && selectedFolderId !== "all" && (
              <button
                onClick={() => moveSelectedToFolder(null)}
                className={`inline-flex items-center h-8 px-3 rounded-md border border-border-strong text-ink bg-canvas hover:bg-surface-soft text-xs font-semibold ${FOCUS_RING}`}
              >
                Remove from folder
              </button>
            )}
            <button
              onClick={unsaveSelected}
              className={`inline-flex items-center h-8 px-3 rounded-md border border-error/40 text-error bg-canvas hover:bg-error/5 text-xs font-semibold ${FOCUS_RING}`}
            >
              Unsave
            </button>
            <button
              onClick={clearSel}
              className={`text-xs text-muted hover:text-ink ${FOCUS_RING} rounded`}
            >
              Clear
            </button>
          </div>
        )}

        <div className="flex items-center justify-between mb-3">
          <p className="text-sm text-muted">
            {items.length} {items.length === 1 ? "item" : "items"}
          </p>
          {items.length > 0 && (
            <button
              onClick={selectedIds.size === items.length ? clearSel : selectAll}
              className={`text-xs text-primary hover:underline ${FOCUS_RING} rounded`}
            >
              {selectedIds.size === items.length ? "Clear selection" : "Select all"}
            </button>
          )}
        </div>

        {/* Skeleton fires while the folder-aware fetch is in flight, even
            if the parent's `wishlistItems` prop has already populated the
            `items` fallback. This way the user sees a clear loading affordance
            every time they land on Saved, not just on first-ever empty load. */}
        {isLoadingSaved && wishlistItemsWithFolder.length === 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => <ListingCardSkeleton key={i} />)}
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 border border-hairline rounded-md bg-surface-soft">
            <p className="text-sm text-muted mb-4">Nothing saved here yet.</p>
            <button
              onClick={() => onNavigate("market")}
              className={`inline-flex items-center justify-center h-9 px-4 rounded-full bg-primary text-on-primary text-sm font-semibold hover:bg-primary-hover transition-colors ${FOCUS_RING}`}
            >
              Browse market
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {items.map((item) => {
              const selected = selectedIds.has(item.id);
              const folderId = "folder_id" in item ? item.folder_id : null;
              const folder = folderId != null ? folders.find((f) => f.id === folderId) : null;
              const listing = item as Listing;
              const heroCommunity = listing.allCommunities?.find((c) => c.is_mutual)
                ?? listing.allCommunities?.[0]
                ?? PLACEHOLDER_COMMUNITY;
              const images = listing.imageUrls && listing.imageUrls.length > 0
                ? listing.imageUrls
                : [listing.imageUrl];
              return (
                <article
                  key={item.id}
                  onClick={() => openListingDetail?.(listing)}
                  className={`group bg-canvas border rounded-md overflow-hidden cursor-pointer transition-shadow ${
                    selected ? "border-primary ring-2 ring-primary" : "border-hairline hover:shadow-hover"
                  }`}
                >
                  {/* Trust band — mirrors marketplace card.
                      Falls back to PLACEHOLDER_COMMUNITY when the wishlist
                      payload omits allCommunities enrichment. */}
                  <div className="flex items-center gap-2 px-3 py-2 bg-primary-soft/60 border-b border-hairline text-xs">
                    <span className="size-3 rounded-full bg-primary shrink-0" aria-hidden="true" />
                    <span className="text-ink font-medium truncate">{heroCommunity.name}</span>
                    {listing.seller_name && (
                      <>
                        <span className="text-muted">·</span>
                        <span className="text-muted truncate">@{listing.seller_name}</span>
                      </>
                    )}
                  </div>

                  {/* Photo */}
                  <div className="relative aspect-square bg-surface-soft">
                    <ListingImage
                      src={images[0]}
                      alt=""
                      size="card"
                      className="absolute inset-0 size-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); toggleSelect(item.id); }}
                      aria-label={selected ? "Deselect" : "Select"}
                      aria-pressed={selected}
                      className={`absolute top-2 left-2 size-6 rounded-full flex items-center justify-center transition-colors ${FOCUS_RING} ${
                        selected ? "bg-primary text-on-primary" : "bg-canvas/90 text-muted hover:text-ink border border-hairline"
                      }`}
                    >
                      {selected ? <Check className="size-3.5" /> : <span className="size-3 rounded-full border-2 border-current" />}
                    </button>
                    {listing.status === "sold" && (
                      <span className="absolute top-2 right-2 text-[10px] font-semibold text-on-primary bg-ink px-2 py-1 rounded-sm">
                        Sold
                      </span>
                    )}
                    {folder && (
                      <div className="absolute bottom-2 right-2 flex items-center gap-0.5 bg-canvas/90 px-2 py-1 rounded-full border border-hairline" title={folder.name}>
                        <FolderIcon className="size-3 text-primary" />
                      </div>
                    )}
                  </div>

                  {/* Body */}
                  <div className="p-3 space-y-1">
                    <p className="text-sm font-medium text-ink line-clamp-1">{formatTitle(listing.brand ?? "", listing.name ?? "")}</p>
                    <p className="text-xs text-muted line-clamp-1">{listing.location}</p>
                    <p className="text-2xl font-extrabold text-primary tracking-display leading-none pt-1">${listing.price}</p>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
