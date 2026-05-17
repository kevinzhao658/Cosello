import { ModalShell } from "../../../components/ui/ModalShell";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { X, Globe, Search, Loader2, Lock, MapPin, Plus } from "lucide-react";

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
      <div className="relative border border-white/15 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl max-h-[85vh] flex flex-col" style={{ backgroundColor: "#18181b" }}>
        <button onClick={onClose} className="absolute top-4 right-4 text-white/40 hover:text-white/70 transition-colors">
          <X className="size-5" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="size-10 bg-cyan-500/15 rounded-full flex items-center justify-center">
            <Globe className="size-5 text-cyan-400" />
          </div>
          <h3 className="text-lg font-medium">Join a Community</h3>
        </div>

        <div className="mb-4">
          <label className="text-xs text-white/40 mb-1.5 block">Search Communities</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-white/30" />
            <Input
              type="text"
              placeholder="Search by name..."
              value={communitySearch}
              onChange={(e) => onSearchChange(e.target.value)}
              className="bg-white/5 border-white/20 text-white placeholder:text-white/30 pl-9"
            />
            {isSearchingCommunities && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 size-3.5 text-white/30 animate-spin" />
            )}
          </div>

          {communitySearch.trim() && (
            <div className="mt-2 min-h-[48px]">
              {isSearchingCommunities ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="size-4 text-white/30 animate-spin" />
                </div>
              ) : communitySearchResults.length > 0 ? (
                <div className="space-y-2 max-h-52 overflow-y-auto">
                  {communitySearchResults.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center gap-3 p-2.5 rounded-lg bg-white/[0.03] border border-white/5 hover:bg-white/5 transition-colors"
                    >
                      <div className="size-10 rounded-lg bg-gradient-to-br from-fuchsia-500/20 to-cyan-500/20 flex items-center justify-center overflow-hidden shrink-0">
                        {c.image ? (
                          <img src={c.image} alt={c.name} className="size-full object-cover rounded-lg" />
                        ) : (
                          <Globe className="size-5 text-cyan-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm text-white/80 truncate">{c.name}</p>
                          {!c.is_public && (
                            <Lock className="size-3 text-amber-400/60 shrink-0" />
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {c.neighborhood && (
                            <p className="text-[10px] text-white/30 truncate flex items-center gap-0.5">
                              <MapPin className="size-2.5" />
                              {c.neighborhood}
                            </p>
                          )}
                          <p className="text-[10px] text-white/20">
                            {c.member_count} {c.member_count === 1 ? "member" : "members"}
                          </p>
                        </div>
                      </div>
                      {c.is_member ? (
                        <span className="text-[10px] text-green-400 bg-green-500/10 px-2 py-1 rounded-full border border-green-400/20 shrink-0">
                          Joined
                        </span>
                      ) : !c.is_public && c.has_requested ? (
                        <Button
                          onClick={() => onCancelRequest(c.id)}
                          disabled={requestingCommunityId === c.id}
                          size="sm"
                          className="bg-amber-500/10 text-amber-400 hover:bg-red-500/15 hover:text-red-400 border border-amber-400/20 hover:border-red-400/20 text-xs px-3 h-7 shrink-0 transition-colors"
                        >
                          {requestingCommunityId === c.id ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            <>Requested <X className="size-3 ml-1" /></>
                          )}
                        </Button>
                      ) : !c.is_public ? (
                        <Button
                          onClick={() => onRequestToJoin(c.id)}
                          disabled={requestingCommunityId === c.id}
                          size="sm"
                          className="bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 border border-amber-400/20 text-xs px-3 h-7 shrink-0"
                        >
                          {requestingCommunityId === c.id ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            "Request"
                          )}
                        </Button>
                      ) : (
                        <Button
                          onClick={() => onJoinBySearch(c.invite_code, c.id)}
                          disabled={joiningCommunityId === c.id}
                          size="sm"
                          className="bg-cyan-500/15 text-cyan-400 hover:bg-cyan-500/25 border border-cyan-400/20 text-xs px-3 h-7 shrink-0"
                        >
                          {joiningCommunityId === c.id ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            "Join"
                          )}
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-xs text-white/30 py-4">No communities found</p>
              )}
            </div>
          )}
        </div>

        <button
          onClick={onToggleInviteCode}
          className="text-xs text-cyan-400/70 hover:text-cyan-400 transition-colors mt-1"
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
              className="bg-white/5 border-white/20 text-white placeholder:text-white/30"
            />

            {joinError && (
              <p className="text-xs text-red-400">{joinError}</p>
            )}

            <Button
              disabled={!joinCode.trim() || isJoining}
              onClick={onJoinByCode}
              className="w-full bg-cyan-500 hover:bg-cyan-600 text-white border-0 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isJoining ? <Loader2 className="size-4 animate-spin" /> : "Join"}
            </Button>
          </div>
        )}

        <div className="relative py-2 mt-2">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-white/10" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="px-2 text-white/30" style={{ backgroundColor: "#18181b" }}>or</span>
          </div>
        </div>

        <Button
          onClick={onCreateClick}
          className="w-full bg-fuchsia-500/15 text-fuchsia-400 hover:bg-fuchsia-500/25 border border-fuchsia-400/20 text-xs"
        >
          <Plus className="size-3.5" />
          Create a Community
        </Button>
      </div>
    </ModalShell>
  );
}
