import { ModalShell } from "../../../components/ui/ModalShell";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { X, UserPlus, Search, Loader2, User, MessageSquare, Globe } from "lucide-react";

export type AddFriendsTab = "recommended" | "contacts" | "qr";

export interface AddFriendsUser {
  id: string;
  display_name: string | null;
  neighborhood: string | null;
  profile_picture: string | null;
  is_friend: boolean;
  mutual_friends_count: number;
  shared_communities_count: number;
}

export interface AddFriendsModalProps {
  open: boolean;
  addFriendsTab: AddFriendsTab;
  addFriendsSearch: string;
  addFriendsResults: AddFriendsUser[];
  recommendedFriends: AddFriendsUser[];
  isAddFriendsSearching: boolean;
  isLoadingRecommended: boolean;
  addingFriendId: string | null;
  onClose: () => void;
  onSearchChange: (q: string) => void;
  onTabChange: (tab: AddFriendsTab) => void;
  onAddFriend: (userId: string) => void;
  onViewUser?: (userId: string) => void;
}

export function AddFriendsModal({
  open, addFriendsTab, addFriendsSearch, addFriendsResults, recommendedFriends,
  isAddFriendsSearching, isLoadingRecommended, addingFriendId,
  onClose, onSearchChange, onTabChange, onAddFriend, onViewUser,
}: AddFriendsModalProps) {
  if (!open) return null;
  return (
    <ModalShell open onClose={onClose} z={50}>
      <div className="relative border border-white/15 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl max-h-[85vh] flex flex-col" style={{ backgroundColor: "#18181b" }}>
        <button onClick={onClose} className="absolute top-4 right-4 text-white/40 hover:text-white/70 transition-colors">
          <X className="size-5" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="size-10 bg-cyan-500/15 rounded-full flex items-center justify-center">
            <UserPlus className="size-5 text-cyan-400" />
          </div>
          <h3 className="text-lg font-medium">Add Friends</h3>
        </div>

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-white/30" />
          <Input
            type="text"
            placeholder="Search by name..."
            value={addFriendsSearch}
            onChange={(e) => onSearchChange(e.target.value)}
            className="bg-white/5 border-white/20 text-white placeholder:text-white/30 pl-9"
          />
          {isAddFriendsSearching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 size-3.5 text-white/30 animate-spin" />
          )}
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          {addFriendsSearch.trim() ? (
            <div className="space-y-1">
              {addFriendsResults.length === 0 && !isAddFriendsSearching && (
                <p className="text-center text-xs text-white/30 py-8">No users found</p>
              )}
              {addFriendsResults.map((person) => (
                <div
                  key={person.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/5 transition-colors"
                >
                  <button onClick={() => onViewUser?.(person.id)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                    <div className="size-9 rounded-full bg-gradient-to-br from-fuchsia-500/30 to-cyan-500/30 flex items-center justify-center overflow-hidden shrink-0">
                      {person.profile_picture ? (
                        <img src={person.profile_picture} alt="" className="size-full object-cover" />
                      ) : (
                        <User className="size-4 text-white/50" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white/80 truncate">{person.display_name}</p>
                      <div className="flex items-center gap-2">
                        {person.neighborhood && (
                          <p className="text-[10px] text-white/30 truncate">{person.neighborhood}</p>
                        )}
                        {person.mutual_friends_count > 0 && (
                          <span className="text-[10px] text-cyan-400/70 bg-cyan-500/10 px-1.5 py-0.5 rounded-full">
                            {person.mutual_friends_count} mutual
                          </span>
                        )}
                        {person.shared_communities_count > 0 && (
                          <span className="text-[10px] text-fuchsia-400/70 bg-fuchsia-500/10 px-1.5 py-0.5 rounded-full">
                            {person.shared_communities_count} communities
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                  {person.is_friend ? (
                    <span className="text-[10px] text-green-400 bg-green-500/10 px-2 py-1 rounded-full border border-green-400/20">
                      Added
                    </span>
                  ) : (
                    <Button
                      onClick={() => onAddFriend(person.id)}
                      disabled={addingFriendId === person.id}
                      size="sm"
                      className="bg-cyan-500/15 text-cyan-400 hover:bg-cyan-500/25 border border-cyan-400/20 text-xs px-3 h-7"
                    >
                      {addingFriendId === person.id ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        "Add"
                      )}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <>
              <div className="flex gap-1 mb-4 bg-white/5 rounded-lg p-1">
                {(["recommended", "contacts", "qr"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => onTabChange(tab)}
                    className={`flex-1 text-xs py-1.5 rounded-md transition-colors capitalize ${
                      addFriendsTab === tab
                        ? "bg-white/10 text-white"
                        : "text-white/40 hover:text-white/60"
                    }`}
                  >
                    {tab === "qr" ? "QR" : tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </button>
                ))}
              </div>

              {addFriendsTab === "recommended" && (
                <div className="space-y-1">
                  {isLoadingRecommended ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="size-5 text-white/30 animate-spin" />
                    </div>
                  ) : recommendedFriends.length === 0 ? (
                    <div className="text-center py-8">
                      <UserPlus className="size-8 text-white/15 mx-auto mb-2" />
                      <p className="text-xs text-white/30">No recommendations yet</p>
                      <p className="text-[10px] text-white/20 mt-1">Join communities to discover people</p>
                    </div>
                  ) : (
                    recommendedFriends.map((person) => (
                      <div
                        key={person.id}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/5 transition-colors"
                      >
                        <button onClick={() => onViewUser?.(person.id)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                          <div className="size-9 rounded-full bg-gradient-to-br from-fuchsia-500/30 to-cyan-500/30 flex items-center justify-center overflow-hidden shrink-0">
                            {person.profile_picture ? (
                              <img src={person.profile_picture} alt="" className="size-full object-cover" />
                            ) : (
                              <User className="size-4 text-white/50" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-white/80 truncate">{person.display_name}</p>
                            <div className="flex items-center gap-2">
                              {person.mutual_friends_count > 0 && (
                                <span className="text-[10px] text-cyan-400/70 bg-cyan-500/10 px-1.5 py-0.5 rounded-full">
                                  {person.mutual_friends_count} mutual
                                </span>
                              )}
                              {person.shared_communities_count > 0 && (
                                <span className="text-[10px] text-fuchsia-400/70 bg-fuchsia-500/10 px-1.5 py-0.5 rounded-full">
                                  {person.shared_communities_count} communities
                                </span>
                              )}
                            </div>
                          </div>
                        </button>
                        <Button
                          onClick={() => onAddFriend(person.id)}
                          disabled={addingFriendId === person.id}
                          size="sm"
                          className="bg-cyan-500/15 text-cyan-400 hover:bg-cyan-500/25 border border-cyan-400/20 text-xs px-3 h-7"
                        >
                          {addingFriendId === person.id ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            "Add"
                          )}
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              )}

              {addFriendsTab === "contacts" && (
                <div className="text-center py-8">
                  <MessageSquare className="size-8 text-white/15 mx-auto mb-2" />
                  <p className="text-xs text-white/30">Connect your contacts to find friends</p>
                  <p className="text-[10px] text-white/20 mt-1">Coming soon</p>
                </div>
              )}

              {addFriendsTab === "qr" && (
                <div className="text-center py-8">
                  <div className="size-24 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center mx-auto mb-3">
                    <Globe className="size-10 text-white/15" />
                  </div>
                  <p className="text-xs text-white/30">Share your QR code to add friends</p>
                  <p className="text-[10px] text-white/20 mt-1">Coming soon</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </ModalShell>
  );
}
