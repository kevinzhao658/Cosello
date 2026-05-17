import { ModalShell } from "../../../components/ui/ModalShell";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { X, Check, Copy, Search, Loader2, User, Plus, Send, MessageSquare } from "lucide-react";

export interface ShareCommunityCreated {
  name: string;
  invite_code: string;
}

export interface ShareCommunityFriend {
  id: string;
  display_name: string | null;
  neighborhood: string | null;
  profile_picture: string | null;
}

export interface ShareCommunityModalProps {
  open: boolean;
  createdCommunity: ShareCommunityCreated | null;
  friendSearch: string;
  friendResults: ShareCommunityFriend[];
  selectedFriends: ShareCommunityFriend[];
  isSearching: boolean;
  isInviting: boolean;
  copiedConfirm: boolean;
  onClose: () => void;
  onCopyCode: (code: string) => void;
  onSearchChange: (q: string) => void;
  onAddFriend: (friend: ShareCommunityFriend) => void;
  onRemoveFriend: (id: string) => void;
  onInvite: () => void;
  onShareSMS: () => void;
  onShareInstagram: () => void;
}

export function ShareCommunityModal({
  open, createdCommunity, friendSearch, friendResults, selectedFriends, isSearching,
  isInviting, copiedConfirm, onClose, onCopyCode, onSearchChange, onAddFriend,
  onRemoveFriend, onInvite, onShareSMS, onShareInstagram,
}: ShareCommunityModalProps) {
  if (!open || !createdCommunity) return null;
  return (
    <ModalShell open onClose={onClose} z={50}>
      <div className="relative border border-white/15 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl" style={{ backgroundColor: "#18181b" }}>
        <button onClick={onClose} className="absolute top-4 right-4 text-white/40 hover:text-white/70 transition-colors">
          <X className="size-5" />
        </button>

        <div className="text-center mb-5">
          <div className="size-14 bg-green-500/15 rounded-full flex items-center justify-center mx-auto mb-3">
            <Check className="size-7 text-green-400" />
          </div>
          <h3 className="text-lg font-medium mb-1">Community Created!</h3>
          <p className="text-sm text-white/50">
            Invite friends to <span className="text-white/80 font-medium">{createdCommunity.name}</span>
          </p>
        </div>

        <div className="mb-5">
          <label className="text-xs text-white/40 mb-1.5 block">Invite Code</label>
          <div className="flex items-center gap-2 bg-white/5 border border-white/15 rounded-lg p-2.5">
            <code className="flex-1 text-center text-lg font-mono tracking-[0.3em] text-cyan-400">
              {createdCommunity.invite_code}
            </code>
            <button
              onClick={() => onCopyCode(createdCommunity.invite_code)}
              className="text-white/40 hover:text-white/70 transition-colors p-1"
            >
              {copiedConfirm ? (
                <Check className="size-4 text-green-400" />
              ) : (
                <Copy className="size-4" />
              )}
            </button>
          </div>
          {copiedConfirm && (
            <p className="text-xs text-green-400 text-center mt-1">Copied to clipboard!</p>
          )}
        </div>

        <div className="mb-4">
          <label className="text-xs text-white/40 mb-1.5 block">Invite Friends</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-white/30" />
            <Input
              type="text"
              placeholder="Search by name..."
              value={friendSearch}
              onChange={(e) => onSearchChange(e.target.value)}
              className="bg-white/5 border-white/20 text-white placeholder:text-white/30 pl-9"
            />
            {isSearching && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 size-3.5 text-white/30 animate-spin" />
            )}
          </div>

          {friendResults.length > 0 && (
            <div className="mt-1 border border-white/10 rounded-lg overflow-hidden max-h-36 overflow-y-auto" style={{ backgroundColor: "#18181b" }}>
              {friendResults.map((friend) => (
                <button
                  key={friend.id}
                  onClick={() => onAddFriend(friend)}
                  className="w-full flex items-center gap-3 px-3 py-2 hover:bg-white/5 transition-colors text-left"
                >
                  <div className="size-7 rounded-full bg-gradient-to-br from-fuchsia-500/30 to-cyan-500/30 flex items-center justify-center overflow-hidden shrink-0">
                    {friend.profile_picture ? (
                      <img src={friend.profile_picture} alt="" className="size-full object-cover" />
                    ) : (
                      <User className="size-3.5 text-white/50" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-white/80 truncate">{friend.display_name}</p>
                    {friend.neighborhood && (
                      <p className="text-[10px] text-white/30 truncate">{friend.neighborhood}</p>
                    )}
                  </div>
                  <Plus className="size-3.5 text-white/30 shrink-0" />
                </button>
              ))}
            </div>
          )}

          {selectedFriends.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {selectedFriends.map((friend) => (
                <span
                  key={friend.id}
                  className="inline-flex items-center gap-1.5 bg-cyan-500/15 text-cyan-400 border border-cyan-400/20 rounded-full pl-2 pr-1 py-0.5 text-xs"
                >
                  {friend.display_name}
                  <button
                    onClick={() => onRemoveFriend(friend.id)}
                    className="hover:text-white transition-colors"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {selectedFriends.length > 0 && (
          <Button
            onClick={onInvite}
            disabled={isInviting}
            className="w-full bg-cyan-500 hover:bg-cyan-600 text-white border-0 mb-3 disabled:opacity-40"
          >
            {isInviting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <>
                <Send className="size-3.5" />
                Invite {selectedFriends.length} {selectedFriends.length === 1 ? "Friend" : "Friends"}
              </>
            )}
          </Button>
        )}

        <div className="mb-4">
          <div className="relative py-2">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/10" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-2 text-white/30" style={{ backgroundColor: "#18181b" }}>or share via</span>
            </div>
          </div>
          <div className="flex gap-3 mt-2">
            <Button
              onClick={onShareSMS}
              className="flex-1 bg-green-500/15 text-green-400 hover:bg-green-500/25 border border-green-400/20 text-xs"
            >
              <MessageSquare className="size-3.5" />
              SMS
            </Button>
            <Button
              onClick={onShareInstagram}
              className="flex-1 bg-fuchsia-500/15 text-fuchsia-400 hover:bg-fuchsia-500/25 border border-fuchsia-400/20 text-xs"
            >
              <Send className="size-3.5" />
              Instagram
            </Button>
          </div>
        </div>

        <Button
          onClick={onClose}
          variant="ghost"
          className="w-full text-xs text-white/40 hover:text-white/60"
        >
          Skip for now
        </Button>
      </div>
    </ModalShell>
  );
}
