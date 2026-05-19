import { ModalShell } from "../../../components/ui/ModalShell";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { X, UserPlus, Search, Loader2, User, MessageSquare, Globe } from "lucide-react";
import { FOCUS_RING } from "../constants";

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

function PersonRow({
  person,
  addingFriendId,
  onAddFriend,
  onViewUser,
  showNeighborhood,
}: {
  person: AddFriendsUser;
  addingFriendId: string | null;
  onAddFriend: (id: string) => void;
  onViewUser?: (id: string) => void;
  showNeighborhood: boolean;
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-surface-soft transition-colors">
      <button
        onClick={() => onViewUser?.(person.id)}
        className={`flex items-center gap-3 flex-1 min-w-0 text-left rounded-md ${FOCUS_RING}`}
      >
        <div className="size-9 rounded-full bg-surface-strong flex items-center justify-center overflow-hidden shrink-0">
          {person.profile_picture ? (
            <img src={person.profile_picture} alt="" className="size-full object-cover" />
          ) : (
            <User className="size-4 text-muted" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-ink truncate">{person.display_name}</p>
          <div className="flex items-center gap-2 flex-wrap">
            {showNeighborhood && person.neighborhood && (
              <p className="text-[11px] text-muted truncate">{person.neighborhood}</p>
            )}
            {person.mutual_friends_count > 0 && (
              <span className="text-[11px] text-primary bg-primary-soft px-1.5 py-0.5 rounded-full">
                {person.mutual_friends_count} mutual
              </span>
            )}
            {person.shared_communities_count > 0 && (
              <span className="text-[11px] text-ink bg-surface-strong px-1.5 py-0.5 rounded-full">
                {person.shared_communities_count} communities
              </span>
            )}
          </div>
        </div>
      </button>
      {person.is_friend ? (
        <span className="text-[11px] text-primary bg-primary-soft px-2 py-1 rounded-full border border-primary/20 font-semibold">
          Added
        </span>
      ) : (
        <Button
          onClick={() => onAddFriend(person.id)}
          disabled={addingFriendId === person.id}
          size="sm"
        >
          {addingFriendId === person.id ? (
            <Loader2 className="size-3 motion-safe:animate-spin" />
          ) : (
            "Add"
          )}
        </Button>
      )}
    </div>
  );
}

export function AddFriendsModal({
  open, addFriendsTab, addFriendsSearch, addFriendsResults, recommendedFriends,
  isAddFriendsSearching, isLoadingRecommended, addingFriendId,
  onClose, onSearchChange, onTabChange, onAddFriend, onViewUser,
}: AddFriendsModalProps) {
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
          <div className="flex items-center gap-3 mb-5">
            <div className="size-10 bg-primary-soft rounded-full flex items-center justify-center">
              <UserPlus className="size-5 text-primary" />
            </div>
            <h3 className="text-xl font-extrabold text-ink tracking-display">Add Friends</h3>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-soft" />
            <Input
              type="text"
              placeholder="Search by name..."
              value={addFriendsSearch}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-9"
            />
            {isAddFriendsSearching && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-soft motion-safe:animate-spin" />
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 px-6 pb-6">
          {addFriendsSearch.trim() ? (
            <div className="space-y-1">
              {addFriendsResults.length === 0 && !isAddFriendsSearching && (
                <p className="text-center text-xs text-muted py-8">No users found</p>
              )}
              {addFriendsResults.map((person) => (
                <PersonRow
                  key={person.id}
                  person={person}
                  addingFriendId={addingFriendId}
                  onAddFriend={onAddFriend}
                  onViewUser={onViewUser}
                  showNeighborhood
                />
              ))}
            </div>
          ) : (
            <>
              <div className="flex gap-1 mb-4 bg-surface-soft rounded-md p-1">
                {(["recommended", "contacts", "qr"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => onTabChange(tab)}
                    aria-pressed={addFriendsTab === tab}
                    className={`flex-1 text-xs py-1.5 rounded-md transition-colors capitalize ${FOCUS_RING} ${
                      addFriendsTab === tab
                        ? "bg-canvas text-ink font-semibold shadow-card"
                        : "text-muted hover:text-ink"
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
                      <Loader2 className="size-5 text-muted-soft motion-safe:animate-spin" />
                    </div>
                  ) : recommendedFriends.length === 0 ? (
                    <div className="text-center py-8">
                      <UserPlus className="size-8 text-muted-soft mx-auto mb-2" />
                      <p className="text-xs text-muted">No recommendations yet</p>
                      <p className="text-[11px] text-muted-soft mt-1">Join communities to discover people</p>
                    </div>
                  ) : (
                    recommendedFriends.map((person) => (
                      <PersonRow
                        key={person.id}
                        person={person}
                        addingFriendId={addingFriendId}
                        onAddFriend={onAddFriend}
                        onViewUser={onViewUser}
                        showNeighborhood={false}
                      />
                    ))
                  )}
                </div>
              )}

              {addFriendsTab === "contacts" && (
                <div className="text-center py-8">
                  <MessageSquare className="size-8 text-muted-soft mx-auto mb-2" />
                  <p className="text-xs text-muted">Connect your contacts to find friends</p>
                  <p className="text-[11px] text-muted-soft mt-1">Coming soon</p>
                </div>
              )}

              {addFriendsTab === "qr" && (
                <div className="text-center py-8">
                  <div className="size-24 bg-surface-soft border border-hairline rounded-md flex items-center justify-center mx-auto mb-3">
                    <Globe className="size-10 text-muted-soft" />
                  </div>
                  <p className="text-xs text-muted">Share your QR code to add friends</p>
                  <p className="text-[11px] text-muted-soft mt-1">Coming soon</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </ModalShell>
  );
}
