import { ModalShell } from "../../../components/ui/ModalShell";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { ListingImage } from "../../../components/ui/ListingImage";
import { X, Globe, Search, Loader2, Lock, MapPin, Plus } from "lucide-react";
import { FOCUS_RING, MODAL_TITLE } from "../constants";

const LABEL_CLASS =
  "block text-[11px] font-semibold tracking-[0.18em] uppercase text-muted mb-1.5";

export interface CommunitySearchResult {
  id: number;
  name: string;
  description: string | null;
  neighborhood: string | null;
  image: string | null;
  invite_code: string;
  member_count: number;
  is_member: boolean;
  is_public: boolean;
  has_requested: boolean;
}

export interface JoinCommunityModalProps {
  open: boolean;
  communitySearch: string;
  communitySearchResults: CommunitySearchResult[];
  isSearchingCommunities: boolean;
  requestingCommunityId: number | null;
  joiningCommunityId: number | null;
  showInviteCode: boolean;
  joinCode: string;
  joinError: string;
  isJoining: boolean;
  onClose: () => void;
  onSearchChange: (q: string) => void;
  onToggleInviteCode: () => void;
  onJoinCodeChange: (s: string) => void;
  onJoinByCode: () => void;
  onJoinBySearch: (inviteCode: string, communityId: number) => void;
  onRequestToJoin: (communityId: number) => void;
  onCancelRequest: (communityId: number) => void;
  onCreateClick: () => void;
}

export function JoinCommunityModal({
  open, communitySearch, communitySearchResults, isSearchingCommunities,
  requestingCommunityId, joiningCommunityId, showInviteCode, joinCode, joinError, isJoining,
  onClose, onSearchChange, onToggleInviteCode, onJoinCodeChange, onJoinByCode,
  onJoinBySearch, onRequestToJoin, onCancelRequest, onCreateClick,
}: JoinCommunityModalProps) {
  if (!open) return null;
  return (
    <ModalShell open onClose={onClose} z={50}>
      <div className="relative bg-canvas border border-hairline rounded-md max-w-md w-full mx-4 shadow-overlay max-h-[85vh] flex flex-col">
        <button
          onClick={onClose}
          aria-label="Close"
          className={`absolute top-3 right-3 size-9 rounded-full text-muted hover:text-ink hover:bg-surface-soft inline-flex items-center justify-center ${FOCUS_RING}`}
        >
          <X className="size-5" />
        </button>

        <div className="px-6 pt-6 pb-2">
          <div className="flex items-center gap-3">
            <div className="size-10 bg-primary-soft rounded-full flex items-center justify-center">
              <Globe className="size-5 text-primary" />
            </div>
            <h3 className={`text-xl ${MODAL_TITLE}`}>Join a Community</h3>
          </div>
        </div>

        <div className="px-6 pb-6 overflow-y-auto">
          <div>
            <label className={LABEL_CLASS}>Search Communities</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-soft" />
              <Input
                type="text"
                placeholder="Search by name..."
                value={communitySearch}
                onChange={(e) => onSearchChange(e.target.value)}
                className="pl-9"
              />
              {isSearchingCommunities && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-soft motion-safe:animate-spin" />
              )}
            </div>

            {communitySearch.trim() && (
              <div className="mt-2 min-h-[48px]">
                {isSearchingCommunities ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="size-4 text-muted-soft motion-safe:animate-spin" />
                  </div>
                ) : communitySearchResults.length > 0 ? (
                  <div className="space-y-2 max-h-52 overflow-y-auto">
                    {communitySearchResults.map((c) => (
                      <div
                        key={c.id}
                        className="flex items-center gap-3 p-2.5 rounded-md bg-surface-card border border-hairline hover:border-border-strong transition-colors"
                      >
                        <div className="size-10 rounded-md bg-surface-strong flex items-center justify-center overflow-hidden shrink-0">
                          {c.image ? (
                            <ListingImage src={c.image} alt="" size="small" className="size-full object-cover rounded-md" />
                          ) : (
                            <Globe className="size-5 text-muted" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm text-ink font-semibold truncate">{c.name}</p>
                            {!c.is_public && (
                              <Lock className="size-3 text-warning shrink-0" />
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {c.neighborhood && (
                              <p className="text-[11px] text-muted truncate flex items-center gap-0.5">
                                <MapPin className="size-2.5" />
                                {c.neighborhood}
                              </p>
                            )}
                            <p className="text-[11px] text-muted-soft">
                              {c.member_count} {c.member_count === 1 ? "member" : "members"}
                            </p>
                          </div>
                        </div>
                        {c.is_member ? (
                          <span className="text-[11px] text-primary bg-primary-soft px-2 py-1 rounded-full border border-primary/20 shrink-0 font-semibold">
                            Joined
                          </span>
                        ) : !c.is_public && c.has_requested ? (
                          <Button
                            onClick={() => onCancelRequest(c.id)}
                            disabled={requestingCommunityId === c.id}
                            variant="outline"
                            size="sm"
                            className="shrink-0"
                          >
                            {requestingCommunityId === c.id ? (
                              <Loader2 className="size-3 motion-safe:animate-spin" />
                            ) : (
                              <>Requested <X className="size-3 ml-1" /></>
                            )}
                          </Button>
                        ) : !c.is_public ? (
                          <Button
                            onClick={() => onRequestToJoin(c.id)}
                            disabled={requestingCommunityId === c.id}
                            variant="outline"
                            size="sm"
                            className="shrink-0"
                          >
                            {requestingCommunityId === c.id ? (
                              <Loader2 className="size-3 motion-safe:animate-spin" />
                            ) : (
                              "Request"
                            )}
                          </Button>
                        ) : (
                          <Button
                            onClick={() => onJoinBySearch(c.invite_code, c.id)}
                            disabled={joiningCommunityId === c.id}
                            size="sm"
                            className="shrink-0"
                          >
                            {joiningCommunityId === c.id ? (
                              <Loader2 className="size-3 motion-safe:animate-spin" />
                            ) : (
                              "Join"
                            )}
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-xs text-muted py-4">No communities found</p>
                )}
              </div>
            )}
          </div>

          <button
            onClick={onToggleInviteCode}
            className={`text-xs text-primary hover:text-primary-hover transition-colors mt-3 rounded-sm ${FOCUS_RING}`}
          >
            Have an invite code?
          </button>

          {showInviteCode && (
            <div className="space-y-3 mt-3">
              <Input
                type="text"
                placeholder="Enter invite code..."
                value={joinCode}
                onChange={(e) => onJoinCodeChange(e.target.value)}
              />

              {joinError && (
                <p className="text-xs text-error">{joinError}</p>
              )}

              <Button
                disabled={!joinCode.trim() || isJoining}
                onClick={onJoinByCode}
                className="w-full"
              >
                {isJoining ? <Loader2 className="size-4 motion-safe:animate-spin" /> : "Join"}
              </Button>
            </div>
          )}

          <div className="relative py-3 mt-2">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-hairline" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-2 text-muted bg-canvas">or</span>
            </div>
          </div>

          <Button
            onClick={onCreateClick}
            variant="outline"
            className="w-full"
            size="sm"
          >
            <Plus className="size-3.5" />
            Create a Community
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}
