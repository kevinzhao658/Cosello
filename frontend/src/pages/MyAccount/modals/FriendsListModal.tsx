import { ModalShell } from "../../../components/ui/ModalShell";
import { Tooltip } from "../../../components/ui/tooltip";
import { X, UserPlus, User, Loader2, Trash2 } from "lucide-react";

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
      <div className="relative border border-white/15 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl max-h-[85vh] flex flex-col" style={{ backgroundColor: "#18181b" }}>
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-white/40 hover:text-white/70 transition-colors"
        >
          <X className="size-5" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="size-10 bg-cyan-500/15 rounded-full flex items-center justify-center">
            <UserPlus className="size-5 text-cyan-400" />
          </div>
          <div>
            <h3 className="text-lg font-medium">Friends</h3>
            <p className="text-xs text-white/40">{friendsList.length} friends</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="size-6 text-white/30 animate-spin" />
            </div>
          ) : friendsList.length === 0 ? (
            <div className="text-center py-12">
              <User className="size-10 text-white/15 mx-auto mb-3" />
              <p className="text-sm text-white/30 mb-1">No friends yet</p>
              <p className="text-xs text-white/20">Add friends from your account page</p>
            </div>
          ) : (
            <div className="space-y-1">
              {friendsList.map((friend) => (
                <div
                  key={friend.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/5 transition-colors"
                >
                  <button onClick={() => onViewUser?.(friend.id)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                    <div className="size-9 rounded-full bg-gradient-to-br from-fuchsia-500/30 to-cyan-500/30 flex items-center justify-center overflow-hidden shrink-0">
                      {friend.profile_picture ? (
                        <img src={friend.profile_picture} alt="" className="size-full object-cover" />
                      ) : (
                        <User className="size-4 text-white/50" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white/80 truncate">{friend.display_name}</p>
                      <div className="flex items-center gap-2">
                        {friend.neighborhood && (
                          <p className="text-[10px] text-white/30 truncate">{friend.neighborhood}</p>
                        )}
                        {friend.mutual_friends_count > 0 && (
                          <span className="text-[10px] text-cyan-400/70 bg-cyan-500/10 px-1.5 py-0.5 rounded-full">
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
                      className="p-1.5 text-muted-soft hover:text-error transition-colors disabled:opacity-30 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                      aria-label="Remove friend"
                    >
                      {removingFriendId === friend.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
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
