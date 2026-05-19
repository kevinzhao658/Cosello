import { ModalShell } from "../../../components/ui/ModalShell";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { X, Check, Copy, Search, Loader2, User, Plus, Send, MessageSquare } from "lucide-react";

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas";

const LABEL_CLASS =
  "block text-[11px] font-semibold tracking-[0.18em] uppercase text-muted mb-1.5";

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
      <div className="relative bg-canvas border border-hairline rounded-md max-w-md w-full mx-4 shadow-overlay max-h-[90vh] flex flex-col">
        <button
          onClick={onClose}
          aria-label="Close"
          className={`absolute top-3 right-3 size-9 rounded-full text-muted hover:text-ink hover:bg-surface-soft inline-flex items-center justify-center ${FOCUS_RING}`}
        >
          <X className="size-5" />
        </button>

        <div className="px-6 pt-6 pb-2">
          <div className="text-center">
            <div className="size-14 bg-primary-soft rounded-full flex items-center justify-center mx-auto mb-3">
              <Check className="size-7 text-primary" />
            </div>
            <h3 className="text-xl font-extrabold text-ink tracking-display mb-1">Community Created!</h3>
            <p className="text-sm text-muted">
              Invite friends to <span className="text-ink font-semibold">{createdCommunity.name}</span>
            </p>
          </div>
        </div>

        <div className="px-6 pb-6 overflow-y-auto space-y-4">
          <div>
            <label className={LABEL_CLASS}>Invite Code</label>
            <div className="flex items-center gap-2 bg-surface-card border border-hairline rounded-md p-2.5">
              <code className="flex-1 text-center text-lg font-mono tracking-[0.3em] text-primary">
                {createdCommunity.invite_code}
              </code>
              <button
                onClick={() => onCopyCode(createdCommunity.invite_code)}
                aria-label="Copy invite code"
                className={`text-muted hover:text-ink transition-colors p-1 rounded-sm ${FOCUS_RING}`}
              >
                {copiedConfirm ? (
                  <Check className="size-4 text-primary" />
                ) : (
                  <Copy className="size-4" />
                )}
              </button>
            </div>
            {copiedConfirm && (
              <p className="text-xs text-primary text-center mt-1">Copied to clipboard!</p>
            )}
          </div>

          <div>
            <label className={LABEL_CLASS}>Invite Friends</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-soft" />
              <Input
                type="text"
                placeholder="Search by name..."
                value={friendSearch}
                onChange={(e) => onSearchChange(e.target.value)}
                className="pl-9"
              />
              {isSearching && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-soft motion-safe:animate-spin" />
              )}
            </div>

            {friendResults.length > 0 && (
              <div className="mt-1 border border-hairline rounded-md overflow-hidden max-h-36 overflow-y-auto bg-canvas">
                {friendResults.map((friend) => (
                  <button
                    key={friend.id}
                    onClick={() => onAddFriend(friend)}
                    className={`w-full flex items-center gap-3 px-3 py-2 hover:bg-surface-soft transition-colors text-left ${FOCUS_RING}`}
                  >
                    <div className="size-7 rounded-full bg-surface-strong flex items-center justify-center overflow-hidden shrink-0">
                      {friend.profile_picture ? (
                        <img src={friend.profile_picture} alt="" className="size-full object-cover" />
                      ) : (
                        <User className="size-3.5 text-muted" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-ink truncate">{friend.display_name}</p>
                      {friend.neighborhood && (
                        <p className="text-[11px] text-muted truncate">{friend.neighborhood}</p>
                      )}
                    </div>
                    <Plus className="size-3.5 text-muted-soft shrink-0" />
                  </button>
                ))}
              </div>
            )}

            {selectedFriends.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {selectedFriends.map((friend) => (
                  <span
                    key={friend.id}
                    className="inline-flex items-center gap-1.5 bg-primary-soft text-primary border border-primary/20 rounded-full pl-2 pr-1 py-0.5 text-xs"
                  >
                    {friend.display_name}
                    <button
                      onClick={() => onRemoveFriend(friend.id)}
                      aria-label={`Remove ${friend.display_name ?? "friend"}`}
                      className={`hover:text-ink transition-colors rounded-full ${FOCUS_RING}`}
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
              className="w-full"
              size="sm"
            >
              {isInviting ? (
                <Loader2 className="size-4 motion-safe:animate-spin" />
              ) : (
                <>
                  <Send className="size-3.5" />
                  Invite {selectedFriends.length} {selectedFriends.length === 1 ? "Friend" : "Friends"}
                </>
              )}
            </Button>
          )}

          <div>
            <div className="relative py-2">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-hairline" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="px-2 text-muted bg-canvas">or share via</span>
              </div>
            </div>
            <div className="flex gap-3 mt-2">
              <Button
                onClick={onShareSMS}
                variant="outline"
                size="sm"
                className="flex-1"
              >
                <MessageSquare className="size-3.5" />
                SMS
              </Button>
              <Button
                onClick={onShareInstagram}
                variant="outline"
                size="sm"
                className="flex-1"
              >
                <Send className="size-3.5" />
                Instagram
              </Button>
            </div>
          </div>
        </div>

        <div className="border-t border-hairline px-6 py-4 flex items-center justify-end gap-2">
          <Button onClick={onClose} variant="ghost" size="sm">
            Skip for now
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}
