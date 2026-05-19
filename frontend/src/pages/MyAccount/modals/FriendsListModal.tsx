import { ModalShell } from "../../../components/ui/ModalShell";
import { Tooltip } from "../../../components/ui/tooltip";
import { X, UserPlus, User, Loader2, Trash2 } from "lucide-react";
import { FOCUS_RING } from "../constants";

export interface FriendListItem {
  id: string;
  display_name: string | null;
  neighborhood: string | null;
  profile_picture: string | null;
  mutual_friends_count: number;
}

export interface FriendsListModalProps {
  open: boolean;
  friendsList: FriendListItem[];
  isLoading: boolean;
  removingFriendId: string | null;
  onClose: () => void;
  onViewUser?: (userId: string) => void;
  onRemoveFriend: (friendId: string) => void;
}

export function FriendsListModal({
  open, friendsList, isLoading, removingFriendId, onClose, onViewUser, onRemoveFriend,
}: FriendsListModalProps) {
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

        <div className="px-6 pt-6 pb-4">
          <div className="flex items-center gap-3">
            <div className="size-10 bg-primary-soft rounded-full flex items-center justify-center">
              <UserPlus className="size-5 text-primary" />
            </div>
            <div>
              <h3 className="text-xl font-extrabold text-ink tracking-display">Friends</h3>
              <p className="text-sm text-muted">{friendsList.length} friends</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 px-6 pb-6">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="size-6 text-muted-soft motion-safe:animate-spin" />
            </div>
          ) : friendsList.length === 0 ? (
            <div className="text-center py-12">
              <User className="size-10 text-muted-soft mx-auto mb-3" />
              <p className="text-sm text-muted mb-1">No friends yet</p>
              <p className="text-xs text-muted-soft">Add friends from your account page</p>
            </div>
          ) : (
            <div className="space-y-1">
              {friendsList.map((friend) => (
                <div
                  key={friend.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-surface-soft transition-colors"
                >
                  <button
                    onClick={() => onViewUser?.(friend.id)}
                    className={`flex items-center gap-3 flex-1 min-w-0 text-left rounded-md ${FOCUS_RING}`}
                  >
                    <div className="size-9 rounded-full bg-surface-strong flex items-center justify-center overflow-hidden shrink-0">
                      {friend.profile_picture ? (
                        <img src={friend.profile_picture} alt="" className="size-full object-cover" />
                      ) : (
                        <User className="size-4 text-muted" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-ink truncate">{friend.display_name}</p>
                      <div className="flex items-center gap-2">
                        {friend.neighborhood && (
                          <p className="text-[11px] text-muted truncate">{friend.neighborhood}</p>
                        )}
                        {friend.mutual_friends_count > 0 && (
                          <span className="text-[11px] text-primary bg-primary-soft px-1.5 py-0.5 rounded-full">
                            {friend.mutual_friends_count} mutual
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                  <Tooltip content="Remove friend">
                    <button
                      onClick={() => onRemoveFriend(friend.id)}
                      disabled={removingFriendId === friend.id}
                      className={`p-1.5 text-muted-soft hover:text-error transition-colors disabled:opacity-30 rounded-md ${FOCUS_RING}`}
                      aria-label="Remove friend"
                    >
                      {removingFriendId === friend.id ? (
                        <Loader2 className="size-3.5 motion-safe:animate-spin" />
                      ) : (
                        <Trash2 className="size-3.5" />
                      )}
                    </button>
                  </Tooltip>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </ModalShell>
  );
}
