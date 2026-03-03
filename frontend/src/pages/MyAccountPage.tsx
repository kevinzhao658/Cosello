import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import {
  User,
  Globe,
  Plus,
  Package,
  Heart,
  SlidersHorizontal,
  MapPin,
  X,
  Camera,
  Loader2,
  Copy,
  Check,
  ImagePlus,
  Lock,
  Unlock,
  Search,
  Send,
  MessageSquare,
  UserPlus,
  Trash2,
  ShoppingBag,
  Pencil,
  LogOut,
  AlertTriangle,
  Users,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

const MANHATTAN_NEIGHBORHOODS = [
  "Battery Park City", "Carnegie Hill", "Chelsea", "Chinatown", "Civic Center",
  "Clinton (Hell's Kitchen)", "East Harlem", "East Village", "Financial District",
  "Flatiron District", "Gramercy Park", "Greenwich Village", "Hamilton Heights",
  "Harlem", "Hudson Heights", "Inwood", "Kips Bay", "Lenox Hill", "Lincoln Square",
  "Little Italy", "Lower East Side", "Marble Hill", "Midtown East", "Midtown West",
  "Morningside Heights", "Murray Hill", "NoHo", "NoMad", "Nolita", "Roosevelt Island",
  "SoHo", "Stuyvesant Town", "Sutton Place", "Theater District", "Tribeca",
  "Tudor City", "Turtle Bay", "Two Bridges", "Upper East Side", "Upper West Side",
  "Washington Heights", "West Village", "Yorkville",
];

interface CommunityData {
  id: number;
  name: string;
  description: string | null;
  neighborhood: string | null;
  image: string | null;
  is_public: boolean;
  invite_code: string;
  created_by: number;
  member_count: number;
  role: string | null;
}

interface SearchUser {
  id: number;
  display_name: string | null;
  neighborhood: string | null;
  profile_picture: string | null;
}

interface FriendSearchUser {
  id: number;
  display_name: string | null;
  neighborhood: string | null;
  profile_picture: string | null;
  is_friend: boolean;
  mutual_friends_count: number;
  shared_communities_count: number;
}

interface ProfileStats {
  total_listings: number;
  purchases: number;
  friends_count: number;
}

interface MyListing {
  id: string;
  title: string;
  price: string;
  condition: string;
  imageUrl: string;
  postedAt: number;
}

interface MyAccountPageProps {
  onNavigate: (page: string) => void;
  onCommunitiesChanged?: () => void;
}

export default function MyAccountPage({ onNavigate, onCommunitiesChanged }: MyAccountPageProps) {
  const { user, token, updateUser } = useAuth();
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState("");
  const [isJoining, setIsJoining] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [communities, setCommunities] = useState<CommunityData[]>([]);
  const [copiedConfirm, setCopiedConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Create community form state
  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createNeighborhood, setCreateNeighborhood] = useState("");
  const [createShowLocationSuggestions, setCreateShowLocationSuggestions] = useState(false);
  const [createIsPublic, setCreateIsPublic] = useState(true);
  const [createImage, setCreateImage] = useState<File | null>(null);
  const [createImagePreview, setCreateImagePreview] = useState<string | null>(null);
  const createImageRef = useRef<HTMLInputElement>(null);
  const createLocationRef = useRef<HTMLInputElement>(null);
  const createLocationSuggestionsRef = useRef<HTMLDivElement>(null);

  // Created community for share modal
  const [createdCommunity, setCreatedCommunity] = useState<CommunityData | null>(null);

  // Share modal state
  const [friendSearch, setFriendSearch] = useState("");
  const [friendResults, setFriendResults] = useState<SearchUser[]>([]);
  const [selectedFriends, setSelectedFriends] = useState<SearchUser[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isInviting, setIsInviting] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Edit Profile modal state
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editNeighborhood, setEditNeighborhood] = useState("");
  const [editShowSuggestions, setEditShowSuggestions] = useState(false);
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [editProfileError, setEditProfileError] = useState("");
  const editSuggestionsRef = useRef<HTMLDivElement>(null);
  const editNeighborhoodRef = useRef<HTMLInputElement>(null);

  // Add Friends modal state
  const [showAddFriendsModal, setShowAddFriendsModal] = useState(false);
  const [addFriendsTab, setAddFriendsTab] = useState<"recommended" | "contacts" | "qr">("recommended");
  const [addFriendsSearch, setAddFriendsSearch] = useState("");
  const [addFriendsResults, setAddFriendsResults] = useState<FriendSearchUser[]>([]);
  const [recommendedFriends, setRecommendedFriends] = useState<FriendSearchUser[]>([]);
  const [isAddFriendsSearching, setIsAddFriendsSearching] = useState(false);
  const [isLoadingRecommended, setIsLoadingRecommended] = useState(false);
  const [addingFriendId, setAddingFriendId] = useState<number | null>(null);
  const addFriendsSearchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Community search state (join modal)
  const [communitySearch, setCommunitySearch] = useState("");
  const [communitySearchResults, setCommunitySearchResults] = useState<{
    id: number;
    name: string;
    description: string | null;
    neighborhood: string | null;
    image: string | null;
    invite_code: string;
    member_count: number;
    is_member: boolean;
  }[]>([]);
  const [isSearchingCommunities, setIsSearchingCommunities] = useState(false);
  const [joiningCommunityId, setJoiningCommunityId] = useState<number | null>(null);
  const communitySearchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Metric modals state
  const [showListingsModal, setShowListingsModal] = useState(false);
  const [showPurchasesModal, setShowPurchasesModal] = useState(false);
  const [showFriendsModal, setShowFriendsModal] = useState(false);
  const [friendsList, setFriendsList] = useState<FriendSearchUser[]>([]);
  const [isLoadingFriends, setIsLoadingFriends] = useState(false);
  const [removingFriendId, setRemovingFriendId] = useState<number | null>(null);

  // Community detail modal state
  const [showCommunityDetail, setShowCommunityDetail] = useState(false);
  const [selectedCommunity, setSelectedCommunity] = useState<CommunityData | null>(null);
  const [communityMembers, setCommunityMembers] = useState<{ id: number; display_name: string | null; neighborhood: string | null; profile_picture: string | null; role: string }[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [isEditingCommunity, setIsEditingCommunity] = useState(false);
  const [editCommunityName, setEditCommunityName] = useState("");
  const [editCommunityDescription, setEditCommunityDescription] = useState("");
  const [editCommunityNeighborhood, setEditCommunityNeighborhood] = useState("");
  const [editCommunityIsPublic, setEditCommunityIsPublic] = useState(true);
  const [isSavingCommunity, setIsSavingCommunity] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeletingCommunity, setIsDeletingCommunity] = useState(false);
  const [isLeavingCommunity, setIsLeavingCommunity] = useState(false);
  const [editCommunityShowSuggestions, setEditCommunityShowSuggestions] = useState(false);
  const editCommunityNeighborhoodRef = useRef<HTMLInputElement>(null);
  const editCommunitySuggestionsRef = useRef<HTMLDivElement>(null);

  // Profile stats
  const [stats, setStats] = useState<ProfileStats>({ total_listings: 0, purchases: 0, friends_count: 0 });
  const [myListings, setMyListings] = useState<MyListing[]>([]);

  const fetchStats = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/friends/stats", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error("Failed to fetch stats:", err);
    }
  }, [token]);

  const fetchMyListings = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/listings/mine", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setMyListings(data);
      }
    } catch (err) {
      console.error("Failed to fetch my listings:", err);
    }
  }, [token]);

  const fetchRecommended = useCallback(async () => {
    if (!token) return;
    setIsLoadingRecommended(true);
    try {
      const res = await fetch("/api/friends/recommended", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setRecommendedFriends(data);
      }
    } catch (err) {
      console.error("Failed to fetch recommended:", err);
    } finally {
      setIsLoadingRecommended(false);
    }
  }, [token]);

  const fetchFriendsList = useCallback(async () => {
    if (!token) return;
    setIsLoadingFriends(true);
    try {
      const res = await fetch("/api/friends", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setFriendsList(data);
      }
    } catch (err) {
      console.error("Failed to fetch friends:", err);
    } finally {
      setIsLoadingFriends(false);
    }
  }, [token]);

  const handleRemoveFriend = async (friendId: number) => {
    if (!token) return;
    setRemovingFriendId(friendId);
    try {
      const res = await fetch(`/api/friends/${friendId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setFriendsList((prev) => prev.filter((f) => f.id !== friendId));
        fetchStats();
      }
    } catch {
      // ignore
    } finally {
      setRemovingFriendId(null);
    }
  };

  const openFriendsModal = () => {
    setShowFriendsModal(true);
    fetchFriendsList();
  };

  const fetchCommunities = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/communities/mine", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCommunities(data);
      }
    } catch (err) {
      console.error("Failed to fetch communities:", err);
    }
  }, [token]);

  useEffect(() => {
    fetchCommunities();
    fetchStats();
    fetchMyListings();
  }, [fetchCommunities, fetchStats, fetchMyListings]);

  const handleProfilePictureUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("image", file);

      const res = await fetch("/api/auth/profile-picture", {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!res.ok) throw new Error("Upload failed");

      const updatedUser = await res.json();
      updateUser(updatedUser);
    } catch (err) {
      console.error("Profile picture upload failed:", err);
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  };

  const handleJoinCommunity = async () => {
    if (!joinCode.trim() || !token) return;
    setIsJoining(true);
    setJoinError("");
    try {
      const res = await fetch("/api/communities/join", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ invite_code: joinCode.trim() }),
      });

      if (!res.ok) {
        const err = await res.json();
        setJoinError(err.detail || "Failed to join community");
        return;
      }

      setJoinCode("");
      setShowJoinModal(false);
      fetchCommunities();
      onCommunitiesChanged?.();
    } catch {
      setJoinError("Network error. Please try again.");
    } finally {
      setIsJoining(false);
    }
  };

  const handleCommunitySearch = (query: string) => {
    setCommunitySearch(query);
    if (communitySearchTimeoutRef.current) clearTimeout(communitySearchTimeoutRef.current);
    if (!query.trim()) {
      setCommunitySearchResults([]);
      return;
    }
    communitySearchTimeoutRef.current = setTimeout(async () => {
      if (!token) return;
      setIsSearchingCommunities(true);
      try {
        const res = await fetch(`/api/communities/search?q=${encodeURIComponent(query.trim())}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setCommunitySearchResults(data);
        }
      } catch {
        // ignore
      } finally {
        setIsSearchingCommunities(false);
      }
    }, 300);
  };

  const handleJoinBySearch = async (inviteCode: string, communityId: number) => {
    if (!token) return;
    setJoiningCommunityId(communityId);
    try {
      const res = await fetch("/api/communities/join", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ invite_code: inviteCode }),
      });
      if (res.ok) {
        setCommunitySearchResults((prev) =>
          prev.map((c) => (c.id === communityId ? { ...c, is_member: true } : c))
        );
        fetchCommunities();
        onCommunitiesChanged?.();
        fetchStats();
      }
    } catch {
      // ignore
    } finally {
      setJoiningCommunityId(null);
    }
  };

  const closeJoinModal = () => {
    setShowJoinModal(false);
    setJoinError("");
    setCommunitySearch("");
    setCommunitySearchResults([]);
  };

  const handleCreateCommunity = async () => {
    if (!createName.trim() || !createDescription.trim() || !createIsValidNeighborhood || !token) return;
    setIsCreating(true);
    try {
      const formData = new FormData();
      formData.append("name", createName.trim());
      formData.append("description", createDescription.trim());
      formData.append("neighborhood", createNeighborhood.trim());
      formData.append("is_public", String(createIsPublic));
      if (createImage) formData.append("image", createImage);

      const res = await fetch("/api/communities", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!res.ok) throw new Error("Create failed");

      const community = await res.json();
      setCreatedCommunity(community);
      setShowCreateModal(false);
      setShowConfirmModal(true);
      fetchFriendsForInvite();
      resetCreateForm();
      fetchCommunities();
      onCommunitiesChanged?.();
    } catch (err) {
      console.error("Create community failed:", err);
    } finally {
      setIsCreating(false);
    }
  };

  const resetCreateForm = () => {
    setCreateName("");
    setCreateDescription("");
    setCreateNeighborhood("");
    setCreateShowLocationSuggestions(false);
    setCreateIsPublic(true);
    setCreateImage(null);
    setCreateImagePreview(null);
  };

  const createIsValidNeighborhood = MANHATTAN_NEIGHBORHOODS.some(
    (n) => n.toLowerCase() === createNeighborhood.trim().toLowerCase()
  );

  const createFilteredNeighborhoods = createNeighborhood.trim()
    ? MANHATTAN_NEIGHBORHOODS.filter((n) =>
        n.toLowerCase().includes(createNeighborhood.trim().toLowerCase())
      )
    : MANHATTAN_NEIGHBORHOODS;

  const handleCreateImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCreateImage(file);
    const reader = new FileReader();
    reader.onload = () => setCreateImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const shareCommunity = async (community: CommunityData) => {
    const shareText = `Join ${community.name} on Grand Exchange! Use invite code: ${community.invite_code}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: community.name, text: shareText });
      } catch {
        // User cancelled — silently ignore
      }
    } else {
      navigator.clipboard.writeText(shareText);
    }
  };

  const copyConfirmCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedConfirm(true);
    setTimeout(() => setCopiedConfirm(false), 2000);
  };

  const openCommunityDetail = async (community: CommunityData) => {
    setSelectedCommunity(community);
    setShowCommunityDetail(true);
    setIsEditingCommunity(false);
    setShowDeleteConfirm(false);
    setIsLoadingMembers(true);
    try {
      const res = await fetch(`/api/communities/${community.id}/members`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCommunityMembers(data);
      }
    } catch {
      // ignore
    } finally {
      setIsLoadingMembers(false);
    }
  };

  const startEditCommunity = () => {
    if (!selectedCommunity) return;
    setEditCommunityName(selectedCommunity.name);
    setEditCommunityDescription(selectedCommunity.description || "");
    setEditCommunityNeighborhood(selectedCommunity.neighborhood || "");
    setEditCommunityIsPublic(selectedCommunity.is_public);
    setIsEditingCommunity(true);
  };

  const editCommunityFilteredNeighborhoods = editCommunityNeighborhood.trim()
    ? MANHATTAN_NEIGHBORHOODS.filter((n) =>
        n.toLowerCase().includes(editCommunityNeighborhood.trim().toLowerCase())
      )
    : MANHATTAN_NEIGHBORHOODS;

  const editCommunityIsValidNeighborhood =
    !editCommunityNeighborhood.trim() ||
    MANHATTAN_NEIGHBORHOODS.some(
      (n) => n.toLowerCase() === editCommunityNeighborhood.trim().toLowerCase()
    );

  const handleSaveCommunity = async () => {
    if (!selectedCommunity || !token) return;
    setIsSavingCommunity(true);
    try {
      const res = await fetch(`/api/communities/${selectedCommunity.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: editCommunityName.trim(),
          description: editCommunityDescription.trim() || null,
          neighborhood: editCommunityNeighborhood.trim() || null,
          is_public: editCommunityIsPublic,
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setSelectedCommunity(updated);
        setCommunities((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
        setIsEditingCommunity(false);
        onCommunitiesChanged?.();
      }
    } catch {
      // ignore
    } finally {
      setIsSavingCommunity(false);
    }
  };

  const handleDeleteCommunity = async () => {
    if (!selectedCommunity || !token) return;
    setIsDeletingCommunity(true);
    try {
      const res = await fetch(`/api/communities/${selectedCommunity.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setCommunities((prev) => prev.filter((c) => c.id !== selectedCommunity!.id));
        setShowCommunityDetail(false);
        setShowDeleteConfirm(false);
        onCommunitiesChanged?.();
      }
    } catch {
      // ignore
    } finally {
      setIsDeletingCommunity(false);
    }
  };

  const handleLeaveCommunity = async () => {
    if (!selectedCommunity || !token) return;
    setIsLeavingCommunity(true);
    try {
      const res = await fetch(`/api/communities/${selectedCommunity.id}/leave`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setCommunities((prev) => prev.filter((c) => c.id !== selectedCommunity!.id));
        setShowCommunityDetail(false);
        onCommunitiesChanged?.();
      }
    } catch {
      // ignore
    } finally {
      setIsLeavingCommunity(false);
    }
  };

  // Cached friends list for invite search
  const [allFriends, setAllFriends] = useState<SearchUser[]>([]);

  const fetchFriendsForInvite = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/friends", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAllFriends(data);
        setFriendResults(data);
      }
    } catch {
      // ignore
    }
  }, [token]);

  const handleFriendSearch = (query: string) => {
    setFriendSearch(query);
    const available = allFriends.filter(
      (f) => !selectedFriends.some((s) => s.id === f.id)
    );
    if (!query.trim()) {
      setFriendResults(available);
      return;
    }
    const q = query.trim().toLowerCase();
    setFriendResults(
      available.filter((f) => f.display_name?.toLowerCase().includes(q))
    );
  };

  const addFriend = (friend: SearchUser) => {
    setSelectedFriends([...selectedFriends, friend]);
    setFriendResults(friendResults.filter((f) => f.id !== friend.id));
    setFriendSearch("");
  };

  const removeFriend = (id: number) => {
    setSelectedFriends(selectedFriends.filter((f) => f.id !== id));
  };

  const handleInviteFriends = async () => {
    if (!createdCommunity || selectedFriends.length === 0 || !token) return;
    setIsInviting(true);
    try {
      await fetch("/api/communities/invite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          community_id: createdCommunity.id,
          user_ids: selectedFriends.map((f) => f.id),
        }),
      });
      setSelectedFriends([]);
      setShowConfirmModal(false);
      fetchCommunities();
    } catch {
      // ignore
    } finally {
      setIsInviting(false);
    }
  };

  const shareViaSMS = () => {
    if (!createdCommunity) return;
    const msg = `Join my community "${createdCommunity.name}" on Grand Exchange! Use invite code: ${createdCommunity.invite_code}`;
    window.open(`sms:?&body=${encodeURIComponent(msg)}`, "_blank");
  };

  const shareViaInstagram = () => {
    if (!createdCommunity) return;
    const text = `Join my community "${createdCommunity.name}" on Grand Exchange! Invite code: ${createdCommunity.invite_code}`;
    navigator.clipboard.writeText(text);
    setCopiedConfirm(true);
    setTimeout(() => setCopiedConfirm(false), 2000);
    window.open("https://www.instagram.com/direct/new/", "_blank");
  };

  const closeShareModal = () => {
    setShowConfirmModal(false);
    setFriendSearch("");
    setFriendResults([]);
    setSelectedFriends([]);
  };

  const handleAddFriendsSearch = (query: string) => {
    setAddFriendsSearch(query);
    if (addFriendsSearchRef.current) clearTimeout(addFriendsSearchRef.current);
    if (!query.trim()) {
      setAddFriendsResults([]);
      return;
    }
    addFriendsSearchRef.current = setTimeout(async () => {
      if (!token) return;
      setIsAddFriendsSearching(true);
      try {
        const res = await fetch(`/api/friends/search?q=${encodeURIComponent(query.trim())}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setAddFriendsResults(data);
        }
      } catch {
        // ignore
      } finally {
        setIsAddFriendsSearching(false);
      }
    }, 300);
  };

  const handleAddFriend = async (userId: number) => {
    if (!token) return;
    setAddingFriendId(userId);
    try {
      const res = await fetch("/api/friends/add", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ user_id: userId }),
      });
      if (res.ok) {
        // Update the search results to reflect the new friendship
        setAddFriendsResults((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, is_friend: true } : u))
        );
        setRecommendedFriends((prev) => prev.filter((u) => u.id !== userId));
        fetchStats();
      }
    } catch {
      // ignore
    } finally {
      setAddingFriendId(null);
    }
  };

  const openAddFriendsModal = () => {
    setShowAddFriendsModal(true);
    setAddFriendsTab("recommended");
    setAddFriendsSearch("");
    setAddFriendsResults([]);
    fetchRecommended();
  };

  const closeAddFriendsModal = () => {
    setShowAddFriendsModal(false);
    setAddFriendsSearch("");
    setAddFriendsResults([]);
  };

  const editIsValidNeighborhood = MANHATTAN_NEIGHBORHOODS.some(
    (n) => n.toLowerCase() === editNeighborhood.trim().toLowerCase()
  );

  const editFilteredNeighborhoods = editNeighborhood.trim()
    ? MANHATTAN_NEIGHBORHOODS.filter((n) =>
        n.toLowerCase().includes(editNeighborhood.trim().toLowerCase())
      )
    : MANHATTAN_NEIGHBORHOODS;

  const openEditProfileModal = () => {
    const name = user?.display_name || "";
    const parts = name.split(" ");
    setEditFirstName(parts[0] || "");
    setEditLastName(parts.slice(1).join(" ") || "");
    setEditNeighborhood(user?.neighborhood || "");
    setEditProfileError("");
    setEditShowSuggestions(false);
    setShowEditProfileModal(true);
  };

  const handleUpdateProfile = async () => {
    if (!editFirstName.trim() || !editLastName.trim()) {
      setEditProfileError("Please enter your first and last name");
      return;
    }
    if (!editIsValidNeighborhood) {
      setEditProfileError("Please select a valid Manhattan neighborhood");
      return;
    }

    setIsUpdatingProfile(true);
    setEditProfileError("");

    try {
      const res = await fetch("/api/auth/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          display_name: `${editFirstName.trim()} ${editLastName.trim()}`,
          neighborhood: editNeighborhood.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ detail: "Update failed" }));
        throw new Error(data.detail);
      }

      const updatedUser = await res.json();
      updateUser(updatedUser);
      setShowEditProfileModal(false);
    } catch (err: any) {
      setEditProfileError(err.message || "Update failed");
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  // Close create location suggestions on click outside
  useEffect(() => {
    if (!createShowLocationSuggestions) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (createLocationRef.current?.contains(target)) return;
      if (createLocationSuggestionsRef.current?.contains(target)) return;
      setCreateShowLocationSuggestions(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [createShowLocationSuggestions]);

  // Close edit suggestions on click outside
  useEffect(() => {
    if (!editShowSuggestions) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (editNeighborhoodRef.current?.contains(target)) return;
      if (editSuggestionsRef.current?.contains(target)) return;
      setEditShowSuggestions(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [editShowSuggestions]);

  // Close edit community neighborhood suggestions on click outside
  useEffect(() => {
    if (!editCommunityShowSuggestions) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (editCommunityNeighborhoodRef.current?.contains(target)) return;
      if (editCommunitySuggestionsRef.current?.contains(target)) return;
      setEditCommunityShowSuggestions(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [editCommunityShowSuggestions]);

  return (
    <section className="py-10 px-4 sm:px-6 lg:px-8 min-h-[calc(100vh-64px)]">
      <div className="max-w-5xl mx-auto">
        {/* Profile Header */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-8 mb-8">
          <div className="flex items-center gap-6">
            {/* Profile Picture */}
            <div className="relative group">
              <div className="size-24 rounded-full bg-gradient-to-br from-fuchsia-500/30 to-cyan-500/30 border-2 border-white/10 flex items-center justify-center overflow-hidden">
                {user?.profile_picture ? (
                  <img
                    src={user.profile_picture}
                    alt={user.display_name || "Profile"}
                    className="size-full object-cover"
                  />
                ) : (
                  <User className="size-10 text-white/60" />
                )}
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              >
                {isUploading ? (
                  <Loader2 className="size-5 text-white/80 animate-spin" />
                ) : (
                  <Camera className="size-5 text-white/80" />
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleProfilePictureUpload}
              />
            </div>

            {/* Name & Neighborhood */}
            <div className="flex-1">
              <h1 className="text-2xl font-light tracking-wider mb-1">
                {user?.display_name || "User"}
              </h1>
              <p className="text-white/50 text-sm flex items-center gap-1.5">
                <MapPin className="size-3.5" />
                {user?.neighborhood || "Manhattan"}
              </p>
              <p className="text-white/30 text-xs mt-1">
                Member since {new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}
              </p>

              {/* Metrics Row */}
              <div className="flex items-center gap-4 mt-3">
                <button
                  onClick={() => setShowListingsModal(true)}
                  className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 hover:bg-white/10 hover:border-white/20 transition-colors cursor-pointer"
                >
                  <span className="text-xs font-medium">{stats.total_listings}</span>
                  <span className="text-[10px] text-white/40">Listings</span>
                </button>
                <button
                  onClick={() => setShowPurchasesModal(true)}
                  className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 hover:bg-white/10 hover:border-white/20 transition-colors cursor-pointer"
                >
                  <span className="text-xs font-medium">{stats.purchases}</span>
                  <span className="text-[10px] text-white/40">Purchases</span>
                </button>
                <button
                  onClick={openFriendsModal}
                  className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 hover:bg-white/10 hover:border-white/20 transition-colors cursor-pointer"
                >
                  <span className="text-xs font-medium">{stats.friends_count}</span>
                  <span className="text-[10px] text-white/40">Friends</span>
                </button>
              </div>
            </div>

            {/* Edit Profile & Add Friends */}
            <div className="flex flex-col gap-2">
              <Button
                onClick={openEditProfileModal}
                variant="outline"
                size="sm"
                className="bg-white/5 border-white/20 text-white/60 hover:text-white hover:bg-white/10 text-xs"
              >
                Edit Profile
              </Button>
              <Button
                onClick={openAddFriendsModal}
                size="sm"
                className="bg-cyan-500/15 text-cyan-400 hover:bg-cyan-500/25 border border-cyan-400/20 text-xs"
              >
                <UserPlus className="size-3.5" />
                Add Friends
              </Button>
            </div>
          </div>
        </div>

        {/* Communities Section */}
        <div className="mb-10">
          <h2 className="text-lg font-light tracking-wider mb-4 text-white/80">Communities</h2>
          <div className="grid grid-cols-4 sm:grid-cols-5 lg:grid-cols-6 gap-2">
            {/* My Neighborhood Virtual Tile */}
            {user?.neighborhood && (
              <div
                className="relative bg-gradient-to-br from-cyan-500/10 to-fuchsia-500/10 border border-cyan-400/20 rounded-lg p-2 hover:from-cyan-500/15 hover:to-fuchsia-500/15 transition-colors aspect-square flex flex-col items-center justify-center gap-1.5 cursor-default"
              >
                <div className="size-10 rounded-full bg-cyan-500/20 flex items-center justify-center shrink-0">
                  <MapPin className="size-5 text-cyan-400" />
                </div>
                <div className="min-w-0 w-full text-center">
                  <h3 className="text-[11px] font-medium truncate leading-tight">My Neighborhood</h3>
                  <p className="text-[9px] text-white/30 truncate mt-0.5">{user.neighborhood}</p>
                </div>
              </div>
            )}

            {/* Community Tiles */}
            {communities.map((community) => (
              <div
                key={community.id}
                onClick={() => openCommunityDetail(community)}
                className="relative bg-white/5 border border-white/10 rounded-lg p-2 hover:bg-white/[0.07] transition-colors aspect-square flex flex-col items-center justify-center gap-1.5 cursor-pointer"
              >
                <button
                  onClick={(e) => { e.stopPropagation(); shareCommunity(community); }}
                  className="absolute top-1.5 right-1.5 text-white/25 hover:text-white/60 transition-colors p-0.5"
                  title="Share community"
                >
                  <Send className="size-3" />
                </button>
                <div className="size-10 rounded-full bg-gradient-to-br from-fuchsia-500/20 to-cyan-500/20 flex items-center justify-center overflow-hidden shrink-0">
                  {community.image ? (
                    <img src={community.image} alt={community.name} className="size-full object-cover" />
                  ) : (
                    <Globe className="size-5 text-cyan-400" />
                  )}
                </div>
                <div className="min-w-0 w-full text-center">
                  <h3 className="text-[11px] font-medium truncate leading-tight">{community.name}</h3>
                  {community.neighborhood && (
                    <div className="flex items-center justify-center gap-0.5 mt-0.5">
                      <MapPin className="size-2.5 text-white/30 shrink-0" />
                      <span className="text-[9px] text-white/30 truncate">{community.neighborhood}</span>
                    </div>
                  )}
                  <p className="text-[9px] text-white/25 mt-0.5">
                    {community.member_count} {community.member_count === 1 ? "member" : "members"}
                  </p>
                </div>
              </div>
            ))}

            {/* Join / Create Community Tile */}
            <button
              onClick={() => setShowJoinModal(true)}
              className="bg-white/[0.02] border border-dashed border-white/15 rounded-lg p-2 hover:bg-white/5 hover:border-white/25 transition-all flex flex-col items-center justify-center gap-1.5 aspect-square cursor-pointer"
            >
              <div className="size-10 rounded-full bg-white/5 flex items-center justify-center">
                <Plus className="size-4 text-white/40" />
              </div>
              <span className="text-[9px] text-white/40">Join or Create</span>
            </button>
          </div>
        </div>

        {/* Three Column Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* My Listings */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-6">
            <div className="flex items-center gap-2.5 mb-5">
              <div className="size-8 rounded-lg bg-fuchsia-500/15 flex items-center justify-center">
                <Package className="size-4 text-fuchsia-400" />
              </div>
              <h3 className="text-sm font-medium">My Listings</h3>
            </div>

            {myListings.length === 0 ? (
              <div className="text-center py-6">
                <Package className="size-8 text-white/15 mx-auto mb-2" />
                <p className="text-xs text-white/30 mb-3">No listings yet</p>
                <Button
                  onClick={() => onNavigate("home")}
                  size="sm"
                  className="bg-fuchsia-500/15 text-fuchsia-400 hover:bg-fuchsia-500/25 border border-fuchsia-400/20 text-xs"
                >
                  Create Listing
                </Button>
              </div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {myListings.map((listing) => (
                  <div
                    key={listing.id}
                    className="flex items-center gap-3 p-2 rounded-lg bg-white/[0.03] border border-white/5 hover:bg-white/5 transition-colors"
                  >
                    <img
                      src={listing.imageUrl}
                      alt={listing.title}
                      className="size-10 rounded-md object-cover border border-white/10 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-white/80 truncate">{listing.title}</p>
                      <p className="text-[10px] text-white/30">{listing.condition}</p>
                    </div>
                    <span className="text-xs font-medium text-fuchsia-400 shrink-0">${listing.price}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 pt-4 border-t border-white/5">
              <div className="flex justify-between text-xs text-white/30">
                <span>Active</span>
                <span>{myListings.length}</span>
              </div>
              <div className="flex justify-between text-xs text-white/30 mt-1">
                <span>Sold</span>
                <span>0</span>
              </div>
            </div>
          </div>

          {/* Wishlist */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-6">
            <div className="flex items-center gap-2.5 mb-5">
              <div className="size-8 rounded-lg bg-red-500/15 flex items-center justify-center">
                <Heart className="size-4 text-red-400" />
              </div>
              <h3 className="text-sm font-medium">Wishlist</h3>
            </div>

            <div className="space-y-3">
              <div className="text-center py-6">
                <Heart className="size-8 text-white/15 mx-auto mb-2" />
                <p className="text-xs text-white/30 mb-3">Nothing saved yet</p>
                <Button
                  onClick={() => onNavigate("market")}
                  size="sm"
                  className="bg-red-500/15 text-red-400 hover:bg-red-500/25 border border-red-400/20 text-xs"
                >
                  Browse Market
                </Button>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-white/5">
              <div className="flex justify-between text-xs text-white/30">
                <span>Saved Items</span>
                <span>0</span>
              </div>
              <div className="flex justify-between text-xs text-white/30 mt-1">
                <span>Price Alerts</span>
                <span>0</span>
              </div>
            </div>
          </div>

          {/* Preferences */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-6">
            <div className="flex items-center gap-2.5 mb-5">
              <div className="size-8 rounded-lg bg-cyan-500/15 flex items-center justify-center">
                <SlidersHorizontal className="size-4 text-cyan-400" />
              </div>
              <h3 className="text-sm font-medium">Preferences</h3>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between py-2">
                <span className="text-xs text-white/50">Notifications</span>
                <span className="text-xs text-white/30">Off</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-xs text-white/50">Pickup Radius</span>
                <span className="text-xs text-white/30">1 mile</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-xs text-white/50">Price Alerts</span>
                <span className="text-xs text-white/30">Off</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-xs text-white/50">Visibility</span>
                <span className="text-xs text-white/30">Public</span>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-white/5">
              <Button
                onClick={() => onNavigate("settings")}
                variant="ghost"
                size="sm"
                className="w-full text-xs text-white/40 hover:text-white/60"
              >
                Manage Settings
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Join Community Modal */}
      {showJoinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={closeJoinModal}
          />
          <div className="relative border border-white/15 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl max-h-[85vh] flex flex-col" style={{ backgroundColor: "#18181b" }}>
            <button
              onClick={closeJoinModal}
              className="absolute top-4 right-4 text-white/40 hover:text-white/70 transition-colors"
            >
              <X className="size-5" />
            </button>

            <div className="flex items-center gap-3 mb-5">
              <div className="size-10 bg-cyan-500/15 rounded-full flex items-center justify-center">
                <Globe className="size-5 text-cyan-400" />
              </div>
              <h3 className="text-lg font-medium">Join a Community</h3>
            </div>

            {/* Search Communities */}
            <div className="mb-4">
              <label className="text-xs text-white/40 mb-1.5 block">Search Communities</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-white/30" />
                <Input
                  type="text"
                  placeholder="Search by name..."
                  value={communitySearch}
                  onChange={(e) => handleCommunitySearch(e.target.value)}
                  className="bg-white/5 border-white/20 text-white placeholder:text-white/30 pl-9"
                />
                {isSearchingCommunities && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 size-3.5 text-white/30 animate-spin" />
                )}
              </div>

              {/* Search Results — stable container to prevent layout shift */}
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
                            <p className="text-sm text-white/80 truncate">{c.name}</p>
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
                          ) : (
                            <Button
                              onClick={() => handleJoinBySearch(c.invite_code, c.id)}
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
                    <p className="text-center text-xs text-white/30 py-4">No public communities found</p>
                  )}
                </div>
              )}
            </div>

            <div className="relative py-2">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/10" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="px-2 text-white/30" style={{ backgroundColor: "#18181b" }}>or use invite code</span>
              </div>
            </div>

            <div className="space-y-3 mt-2">
              <Input
                type="text"
                placeholder="Enter invite code..."
                value={joinCode}
                onChange={(e) => { setJoinCode(e.target.value); setJoinError(""); }}
                className="bg-white/5 border-white/20 text-white placeholder:text-white/30"
              />

              {joinError && (
                <p className="text-xs text-red-400">{joinError}</p>
              )}

              <Button
                disabled={!joinCode.trim() || isJoining}
                onClick={handleJoinCommunity}
                className="w-full bg-cyan-500 hover:bg-cyan-600 text-white border-0 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isJoining ? <Loader2 className="size-4 animate-spin" /> : "Join"}
              </Button>

              <div className="relative py-2">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-white/10" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="px-2 text-white/30" style={{ backgroundColor: "#18181b" }}>or</span>
                </div>
              </div>

              <Button
                onClick={() => { closeJoinModal(); setShowCreateModal(true); }}
                className="w-full bg-fuchsia-500/15 text-fuchsia-400 hover:bg-fuchsia-500/25 border border-fuchsia-400/20 text-xs"
              >
                <Plus className="size-3.5" />
                Create a Community
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Create Community Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => { setShowCreateModal(false); resetCreateForm(); }}
          />
          <div className="relative border border-white/15 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl" style={{ backgroundColor: "#18181b" }}>
            <button
              onClick={() => { setShowCreateModal(false); resetCreateForm(); }}
              className="absolute top-4 right-4 text-white/40 hover:text-white/70 transition-colors"
            >
              <X className="size-5" />
            </button>

            <div className="flex items-center gap-3 mb-5">
              <div className="size-10 bg-fuchsia-500/15 rounded-full flex items-center justify-center">
                <Plus className="size-5 text-fuchsia-400" />
              </div>
              <h3 className="text-lg font-medium">Create a Community</h3>
            </div>

            <div className="space-y-4">
              {/* Community Image */}
              <div className="flex flex-col items-center">
                <button
                  onClick={() => createImageRef.current?.click()}
                  className="size-20 rounded-full border-2 border-dashed border-white/20 bg-white/[0.03] hover:bg-white/5 hover:border-white/30 transition-all flex flex-col items-center justify-center cursor-pointer overflow-hidden"
                >
                  {createImagePreview ? (
                    <img src={createImagePreview} alt="Preview" className="size-full object-cover" />
                  ) : (
                    <ImagePlus className="size-5 text-white/30" />
                  )}
                </button>
                <span className="text-[11px] text-white/30 mt-1.5">Community Badge</span>
                <input
                  ref={createImageRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleCreateImageSelect}
                />
              </div>

              {/* Community Name */}
              <div>
                <label className="text-xs text-white/50 mb-1.5 block">Community Name *</label>
                <Input
                  type="text"
                  placeholder="e.g., Chelsea Book Club"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  className="bg-white/5 border-white/20 text-white placeholder:text-white/30"
                />
              </div>

              {/* Description */}
              <div>
                <label className="text-xs text-white/50 mb-1.5 block">Description *</label>
                <textarea
                  placeholder="What's this community about?"
                  value={createDescription}
                  onChange={(e) => setCreateDescription(e.target.value)}
                  rows={2}
                  className="w-full rounded-md bg-white/5 border border-white/20 text-white placeholder:text-white/30 text-sm px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500/50"
                />
              </div>

              {/* Pickup Location */}
              <div className="relative">
                <label className="text-xs text-white/50 mb-1.5 block">Pickup Location *</label>
                <Input
                  ref={createLocationRef}
                  type="text"
                  placeholder="e.g., Chelsea"
                  value={createNeighborhood}
                  onChange={(e) => {
                    setCreateNeighborhood(e.target.value);
                    setCreateShowLocationSuggestions(true);
                  }}
                  onFocus={() => setCreateShowLocationSuggestions(true)}
                  className="bg-white/5 border-white/20 text-white placeholder:text-white/30"
                />
                {createShowLocationSuggestions && createFilteredNeighborhoods.length > 0 && (
                  <div
                    ref={createLocationSuggestionsRef}
                    className="absolute z-50 mt-1 w-full max-h-40 overflow-y-auto rounded-md border border-white/20 shadow-lg"
                    style={{ backgroundColor: "#18181b" }}
                  >
                    {createFilteredNeighborhoods.map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => {
                          setCreateNeighborhood(n);
                          setCreateShowLocationSuggestions(false);
                        }}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-white/10 transition-colors ${
                          n.toLowerCase() === createNeighborhood.trim().toLowerCase()
                            ? "text-fuchsia-400"
                            : "text-white"
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                )}
                {createShowLocationSuggestions && createFilteredNeighborhoods.length === 0 && createNeighborhood.trim() && (
                  <div
                    className="absolute z-50 mt-1 w-full rounded-md border border-white/20 shadow-lg px-3 py-2 text-sm text-white/40"
                    style={{ backgroundColor: "#18181b" }}
                  >
                    No matching neighborhoods
                  </div>
                )}
              </div>

              {/* Public / Private Toggle */}
              <div className="flex items-center justify-between py-1">
                <div className="flex items-center gap-2">
                  {createIsPublic ? (
                    <Unlock className="size-4 text-cyan-400" />
                  ) : (
                    <Lock className="size-4 text-fuchsia-400" />
                  )}
                  <span className="text-sm text-white/70">
                    {createIsPublic ? "Public" : "Private"}
                  </span>
                </div>
                <button
                  onClick={() => setCreateIsPublic(!createIsPublic)}
                  className={`relative w-10 h-5 rounded-full transition-colors ${
                    createIsPublic ? "bg-cyan-500" : "bg-white/20"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 size-4 rounded-full bg-white transition-transform ${
                      createIsPublic ? "left-5.5" : "left-0.5"
                    }`}
                  />
                </button>
              </div>

              {/* Create Button */}
              <Button
                disabled={!createName.trim() || !createDescription.trim() || !createIsValidNeighborhood || isCreating}
                onClick={handleCreateCommunity}
                className="w-full bg-fuchsia-500 hover:bg-fuchsia-600 text-white border-0 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isCreating ? <Loader2 className="size-4 animate-spin" /> : "Create"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Share Community Modal */}
      {showConfirmModal && createdCommunity && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={closeShareModal}
          />
          <div className="relative border border-white/15 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl" style={{ backgroundColor: "#18181b" }}>
            <button
              onClick={closeShareModal}
              className="absolute top-4 right-4 text-white/40 hover:text-white/70 transition-colors"
            >
              <X className="size-5" />
            </button>

            {/* Header */}
            <div className="text-center mb-5">
              <div className="size-14 bg-green-500/15 rounded-full flex items-center justify-center mx-auto mb-3">
                <Check className="size-7 text-green-400" />
              </div>
              <h3 className="text-lg font-medium mb-1">Community Created!</h3>
              <p className="text-sm text-white/50">
                Invite friends to <span className="text-white/80 font-medium">{createdCommunity.name}</span>
              </p>
            </div>

            {/* Invite Code */}
            <div className="mb-5">
              <label className="text-xs text-white/40 mb-1.5 block">Invite Code</label>
              <div className="flex items-center gap-2 bg-white/5 border border-white/15 rounded-lg p-2.5">
                <code className="flex-1 text-center text-lg font-mono tracking-[0.3em] text-cyan-400">
                  {createdCommunity.invite_code}
                </code>
                <button
                  onClick={() => copyConfirmCode(createdCommunity.invite_code)}
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

            {/* Search Friends */}
            <div className="mb-4">
              <label className="text-xs text-white/40 mb-1.5 block">Invite Friends</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-white/30" />
                <Input
                  type="text"
                  placeholder="Search by name..."
                  value={friendSearch}
                  onChange={(e) => handleFriendSearch(e.target.value)}
                  className="bg-white/5 border-white/20 text-white placeholder:text-white/30 pl-9"
                />
                {isSearching && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 size-3.5 text-white/30 animate-spin" />
                )}
              </div>

              {/* Search Results Dropdown */}
              {friendResults.length > 0 && (
                <div className="mt-1 border border-white/10 rounded-lg overflow-hidden max-h-36 overflow-y-auto" style={{ backgroundColor: "#18181b" }}>
                  {friendResults.map((friend) => (
                    <button
                      key={friend.id}
                      onClick={() => addFriend(friend)}
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

              {/* Selected Friends */}
              {selectedFriends.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {selectedFriends.map((friend) => (
                    <span
                      key={friend.id}
                      className="inline-flex items-center gap-1.5 bg-cyan-500/15 text-cyan-400 border border-cyan-400/20 rounded-full pl-2 pr-1 py-0.5 text-xs"
                    >
                      {friend.display_name}
                      <button
                        onClick={() => removeFriend(friend.id)}
                        className="hover:text-white transition-colors"
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Invite Button */}
            {selectedFriends.length > 0 && (
              <Button
                onClick={handleInviteFriends}
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

            {/* Share via SMS / Instagram */}
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
                  onClick={shareViaSMS}
                  className="flex-1 bg-green-500/15 text-green-400 hover:bg-green-500/25 border border-green-400/20 text-xs"
                >
                  <MessageSquare className="size-3.5" />
                  SMS
                </Button>
                <Button
                  onClick={shareViaInstagram}
                  className="flex-1 bg-fuchsia-500/15 text-fuchsia-400 hover:bg-fuchsia-500/25 border border-fuchsia-400/20 text-xs"
                >
                  <Send className="size-3.5" />
                  Instagram
                </Button>
              </div>
            </div>

            <Button
              onClick={closeShareModal}
              variant="ghost"
              className="w-full text-xs text-white/40 hover:text-white/60"
            >
              Skip for now
            </Button>
          </div>
        </div>
      )}
      {/* Edit Profile Modal */}
      {showEditProfileModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowEditProfileModal(false)}
          />
          <div className="relative border border-white/15 rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl" style={{ backgroundColor: "#18181b" }}>
            <button
              onClick={() => setShowEditProfileModal(false)}
              className="absolute top-4 right-4 text-white/40 hover:text-white/70 transition-colors"
            >
              <X className="size-5" />
            </button>

            <div className="flex items-center gap-3 mb-5">
              <div className="size-10 bg-fuchsia-500/15 rounded-full flex items-center justify-center">
                <User className="size-5 text-fuchsia-400" />
              </div>
              <h3 className="text-lg font-medium">Edit Profile</h3>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-white/40 uppercase tracking-wider mb-1.5">
                    First Name
                  </label>
                  <Input
                    type="text"
                    placeholder="First"
                    value={editFirstName}
                    onChange={(e) => setEditFirstName(e.target.value)}
                    className="bg-white/5 border-white/20 text-white placeholder:text-white/30"
                  />
                </div>
                <div>
                  <label className="block text-xs text-white/40 uppercase tracking-wider mb-1.5">
                    Last Name
                  </label>
                  <Input
                    type="text"
                    placeholder="Last"
                    value={editLastName}
                    onChange={(e) => setEditLastName(e.target.value)}
                    className="bg-white/5 border-white/20 text-white placeholder:text-white/30"
                  />
                </div>
              </div>

              <div className="relative">
                <label className="block text-xs text-white/40 uppercase tracking-wider mb-1.5">
                  Neighborhood
                </label>
                <Input
                  ref={editNeighborhoodRef}
                  type="text"
                  placeholder="e.g., Chelsea"
                  value={editNeighborhood}
                  onChange={(e) => {
                    setEditNeighborhood(e.target.value);
                    setEditShowSuggestions(true);
                  }}
                  onFocus={() => setEditShowSuggestions(true)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && editIsValidNeighborhood) handleUpdateProfile();
                  }}
                  className="bg-white/5 border-white/20 text-white placeholder:text-white/30"
                />

                {editShowSuggestions && editFilteredNeighborhoods.length > 0 && (
                  <div
                    ref={editSuggestionsRef}
                    className="absolute z-50 mt-1 w-full max-h-40 overflow-y-auto rounded-md border border-white/20 shadow-lg"
                    style={{ backgroundColor: "#18181b" }}
                  >
                    {editFilteredNeighborhoods.map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => {
                          setEditNeighborhood(n);
                          setEditShowSuggestions(false);
                        }}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-white/10 transition-colors ${
                          n.toLowerCase() === editNeighborhood.trim().toLowerCase()
                            ? "text-fuchsia-400"
                            : "text-white"
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                )}

                {editShowSuggestions && editFilteredNeighborhoods.length === 0 && editNeighborhood.trim() && (
                  <div
                    className="absolute z-50 mt-1 w-full rounded-md border border-white/20 shadow-lg px-3 py-2 text-sm text-white/40"
                    style={{ backgroundColor: "#18181b" }}
                  >
                    No matching neighborhoods
                  </div>
                )}
              </div>

              {editProfileError && <p className="text-sm text-red-400">{editProfileError}</p>}

              <Button
                onClick={handleUpdateProfile}
                disabled={isUpdatingProfile || !editIsValidNeighborhood || !editFirstName.trim() || !editLastName.trim()}
                className="w-full bg-fuchsia-500 hover:bg-fuchsia-600 text-white border-0 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isUpdatingProfile ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  "Save Changes"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Add Friends Modal */}
      {showAddFriendsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={closeAddFriendsModal}
          />
          <div className="relative border border-white/15 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl max-h-[85vh] flex flex-col" style={{ backgroundColor: "#18181b" }}>
            <button
              onClick={closeAddFriendsModal}
              className="absolute top-4 right-4 text-white/40 hover:text-white/70 transition-colors"
            >
              <X className="size-5" />
            </button>

            {/* Header */}
            <div className="flex items-center gap-3 mb-5">
              <div className="size-10 bg-cyan-500/15 rounded-full flex items-center justify-center">
                <UserPlus className="size-5 text-cyan-400" />
              </div>
              <h3 className="text-lg font-medium">Add Friends</h3>
            </div>

            {/* Search Bar */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-white/30" />
              <Input
                type="text"
                placeholder="Search by name..."
                value={addFriendsSearch}
                onChange={(e) => handleAddFriendsSearch(e.target.value)}
                className="bg-white/5 border-white/20 text-white placeholder:text-white/30 pl-9"
              />
              {isAddFriendsSearching && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 size-3.5 text-white/30 animate-spin" />
              )}
            </div>

            {/* Search Results or Tabs */}
            <div className="flex-1 overflow-y-auto min-h-0">
              {addFriendsSearch.trim() ? (
                /* Search Results */
                <div className="space-y-1">
                  {addFriendsResults.length === 0 && !isAddFriendsSearching && (
                    <p className="text-center text-xs text-white/30 py-8">No users found</p>
                  )}
                  {addFriendsResults.map((person) => (
                    <div
                      key={person.id}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/5 transition-colors"
                    >
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
                      {person.is_friend ? (
                        <span className="text-[10px] text-green-400 bg-green-500/10 px-2 py-1 rounded-full border border-green-400/20">
                          Added
                        </span>
                      ) : (
                        <Button
                          onClick={() => handleAddFriend(person.id)}
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
                /* Tabs */
                <>
                  <div className="flex gap-1 mb-4 bg-white/5 rounded-lg p-1">
                    {(["recommended", "contacts", "qr"] as const).map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setAddFriendsTab(tab)}
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
                            <Button
                              onClick={() => handleAddFriend(person.id)}
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
        </div>
      )}
      {/* Listings Modal */}
      {showListingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowListingsModal(false)}
          />
          <div className="relative border border-white/15 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl max-h-[85vh] flex flex-col" style={{ backgroundColor: "#18181b" }}>
            <button
              onClick={() => setShowListingsModal(false)}
              className="absolute top-4 right-4 text-white/40 hover:text-white/70 transition-colors"
            >
              <X className="size-5" />
            </button>

            <div className="flex items-center gap-3 mb-5">
              <div className="size-10 bg-fuchsia-500/15 rounded-full flex items-center justify-center">
                <Package className="size-5 text-fuchsia-400" />
              </div>
              <div>
                <h3 className="text-lg font-medium">My Listings</h3>
                <p className="text-xs text-white/40">{myListings.length} active</p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0">
              {myListings.length === 0 ? (
                <div className="text-center py-12">
                  <Package className="size-10 text-white/15 mx-auto mb-3" />
                  <p className="text-sm text-white/30 mb-1">No listings yet</p>
                  <p className="text-xs text-white/20">Create your first listing from the homepage</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {myListings.map((listing) => (
                    <div
                      key={listing.id}
                      className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.03] border border-white/5 hover:bg-white/5 transition-colors"
                    >
                      <img
                        src={listing.imageUrl}
                        alt={listing.title}
                        className="size-14 rounded-lg object-cover border border-white/10 shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white/80 truncate">{listing.title}</p>
                        <p className="text-xs text-white/30 mt-0.5">{listing.condition}</p>
                        <p className="text-[10px] text-white/20 mt-0.5">
                          {new Date(listing.postedAt * 1000).toLocaleDateString()}
                        </p>
                      </div>
                      <span className="text-sm font-medium text-fuchsia-400 shrink-0">${listing.price}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Purchases Modal */}
      {showPurchasesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowPurchasesModal(false)}
          />
          <div className="relative border border-white/15 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl" style={{ backgroundColor: "#18181b" }}>
            <button
              onClick={() => setShowPurchasesModal(false)}
              className="absolute top-4 right-4 text-white/40 hover:text-white/70 transition-colors"
            >
              <X className="size-5" />
            </button>

            <div className="flex items-center gap-3 mb-5">
              <div className="size-10 bg-green-500/15 rounded-full flex items-center justify-center">
                <ShoppingBag className="size-5 text-green-400" />
              </div>
              <div>
                <h3 className="text-lg font-medium">Purchases</h3>
                <p className="text-xs text-white/40">{stats.purchases} total</p>
              </div>
            </div>

            <div className="text-center py-12">
              <ShoppingBag className="size-10 text-white/15 mx-auto mb-3" />
              <p className="text-sm text-white/30 mb-1">No purchases yet</p>
              <p className="text-xs text-white/20">Items you buy will appear here</p>
            </div>
          </div>
        </div>
      )}

      {/* Friends List Modal */}
      {showFriendsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowFriendsModal(false)}
          />
          <div className="relative border border-white/15 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl max-h-[85vh] flex flex-col" style={{ backgroundColor: "#18181b" }}>
            <button
              onClick={() => setShowFriendsModal(false)}
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
              {isLoadingFriends ? (
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
                      <button
                        onClick={() => handleRemoveFriend(friend.id)}
                        disabled={removingFriendId === friend.id}
                        className="p-1.5 text-white/20 hover:text-red-400 transition-colors disabled:opacity-30"
                        title="Remove friend"
                      >
                        {removingFriendId === friend.id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="size-3.5" />
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Community Detail Modal */}
      {showCommunityDetail && selectedCommunity && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => { setShowCommunityDetail(false); setIsEditingCommunity(false); setShowDeleteConfirm(false); }}
          />
          <div className="relative border border-white/15 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl max-h-[85vh] flex flex-col" style={{ backgroundColor: "#18181b" }}>
            <button
              onClick={() => { setShowCommunityDetail(false); setIsEditingCommunity(false); setShowDeleteConfirm(false); }}
              className="absolute top-4 right-4 text-white/40 hover:text-white/70 transition-colors"
            >
              <X className="size-5" />
            </button>

            {/* Delete Confirmation Overlay */}
            {showDeleteConfirm && (
              <div className="absolute inset-0 z-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "rgba(24, 24, 27, 0.95)" }}>
                <div className="text-center px-6">
                  <div className="size-12 bg-red-500/15 rounded-full flex items-center justify-center mx-auto mb-4">
                    <AlertTriangle className="size-6 text-red-400" />
                  </div>
                  <h3 className="text-lg font-medium mb-2">Delete Community</h3>
                  <p className="text-sm text-white/50 mb-6">
                    Are you sure you want to delete <span className="text-white/80 font-medium">{selectedCommunity.name}</span>? This action cannot be undone and all members will be removed.
                  </p>
                  <div className="flex gap-3">
                    <Button
                      onClick={() => setShowDeleteConfirm(false)}
                      className="flex-1 bg-white/10 hover:bg-white/15 text-white border-0"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleDeleteCommunity}
                      disabled={isDeletingCommunity}
                      className="flex-1 bg-red-500 hover:bg-red-600 text-white border-0"
                    >
                      {isDeletingCommunity ? <Loader2 className="size-4 animate-spin" /> : "Delete"}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {isEditingCommunity ? (
              /* Edit Mode */
              <>
                <div className="flex items-center gap-3 mb-5">
                  <div className="size-10 bg-fuchsia-500/15 rounded-full flex items-center justify-center">
                    <Pencil className="size-5 text-fuchsia-400" />
                  </div>
                  <h3 className="text-lg font-medium">Edit Community</h3>
                </div>

                <div className="flex-1 overflow-y-auto min-h-0 space-y-4">
                  <div>
                    <label className="text-xs text-white/40 mb-1 block">Name</label>
                    <Input
                      value={editCommunityName}
                      onChange={(e) => setEditCommunityName(e.target.value)}
                      className="bg-white/5 border-white/20 text-white"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-white/40 mb-1 block">Description</label>
                    <textarea
                      value={editCommunityDescription}
                      onChange={(e) => setEditCommunityDescription(e.target.value)}
                      rows={3}
                      className="w-full rounded-md bg-white/5 border border-white/20 text-white text-sm px-3 py-2 resize-none focus:outline-none focus:border-white/40"
                    />
                  </div>

                  <div className="relative">
                    <label className="text-xs text-white/40 mb-1 block">Primary Pickup Location</label>
                    <Input
                      ref={editCommunityNeighborhoodRef}
                      value={editCommunityNeighborhood}
                      onChange={(e) => {
                        setEditCommunityNeighborhood(e.target.value);
                        setEditCommunityShowSuggestions(true);
                      }}
                      onFocus={() => setEditCommunityShowSuggestions(true)}
                      placeholder="e.g. Upper West Side"
                      className="bg-white/5 border-white/20 text-white placeholder:text-white/30"
                    />
                    {editCommunityShowSuggestions && editCommunityFilteredNeighborhoods.length > 0 && (
                      <div
                        ref={editCommunitySuggestionsRef}
                        className="absolute z-50 mt-1 w-full max-h-40 overflow-y-auto rounded-md border border-white/20 shadow-lg"
                        style={{ backgroundColor: "#18181b" }}
                      >
                        {editCommunityFilteredNeighborhoods.map((n) => (
                          <button
                            key={n}
                            type="button"
                            className="w-full text-left px-3 py-2 text-sm text-white/70 hover:bg-white/10 transition-colors"
                            onClick={() => {
                              setEditCommunityNeighborhood(n);
                              setEditCommunityShowSuggestions(false);
                            }}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {editCommunityIsPublic ? (
                        <Unlock className="size-4 text-green-400" />
                      ) : (
                        <Lock className="size-4 text-amber-400" />
                      )}
                      <span className="text-sm text-white/70">
                        {editCommunityIsPublic ? "Public" : "Private"}
                      </span>
                    </div>
                    <button
                      onClick={() => setEditCommunityIsPublic(!editCommunityIsPublic)}
                      className={`relative w-10 h-5 rounded-full transition-colors ${
                        editCommunityIsPublic ? "bg-green-500/30" : "bg-white/10"
                      }`}
                    >
                      <div
                        className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-transform ${
                          editCommunityIsPublic ? "translate-x-5" : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  </div>

                  {/* Delete Community */}
                  <div className="pt-4 border-t border-white/10">
                    <button
                      onClick={() => setShowDeleteConfirm(true)}
                      className="flex items-center gap-2 text-red-400/70 hover:text-red-400 transition-colors text-sm"
                    >
                      <Trash2 className="size-4" />
                      Delete Community
                    </button>
                  </div>
                </div>

                <div className="flex gap-3 mt-5">
                  <Button
                    onClick={() => setIsEditingCommunity(false)}
                    className="flex-1 bg-white/10 hover:bg-white/15 text-white border-0"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSaveCommunity}
                    disabled={isSavingCommunity || !editCommunityName.trim() || !editCommunityIsValidNeighborhood}
                    className="flex-1 bg-fuchsia-500 hover:bg-fuchsia-600 text-white border-0 disabled:opacity-40"
                  >
                    {isSavingCommunity ? <Loader2 className="size-4 animate-spin" /> : "Save"}
                  </Button>
                </div>
              </>
            ) : (
              /* View Mode */
              <>
                {/* Header */}
                <div className="flex items-start gap-3 mb-5 pr-8">
                  <div className="size-12 rounded-xl bg-gradient-to-br from-fuchsia-500/20 to-cyan-500/20 flex items-center justify-center overflow-hidden shrink-0">
                    {selectedCommunity.image ? (
                      <img src={selectedCommunity.image} alt={selectedCommunity.name} className="size-full object-cover rounded-xl" />
                    ) : (
                      <Globe className="size-6 text-cyan-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-medium truncate">{selectedCommunity.name}</h3>
                    <div className="flex items-center gap-3 mt-0.5">
                      {selectedCommunity.neighborhood && (
                        <div className="flex items-center gap-1">
                          <MapPin className="size-3 text-white/30" />
                          <span className="text-xs text-white/40">{selectedCommunity.neighborhood}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1">
                        <Users className="size-3 text-white/30" />
                        <span className="text-xs text-white/40">{selectedCommunity.member_count} members</span>
                      </div>
                    </div>
                  </div>
                </div>

                {selectedCommunity.description && (
                  <p className="text-sm text-white/50 mb-4">{selectedCommunity.description}</p>
                )}

                {/* Invite Code */}
                <div className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2 mb-4">
                  <span className="text-xs text-white/30">Invite Code:</span>
                  <span className="text-xs text-white/70 font-mono tracking-wider">{selectedCommunity.invite_code}</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(selectedCommunity.invite_code);
                    }}
                    className="ml-auto text-white/30 hover:text-white/60 transition-colors"
                    title="Copy invite code"
                  >
                    <Copy className="size-3.5" />
                  </button>
                </div>

                {/* Members List */}
                <div className="mb-4">
                  <h4 className="text-xs text-white/40 mb-2 uppercase tracking-wider">Members</h4>
                  <div className="flex-1 overflow-y-auto max-h-48 min-h-0">
                    {isLoadingMembers ? (
                      <div className="flex justify-center py-6">
                        <Loader2 className="size-5 text-white/30 animate-spin" />
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {communityMembers.map((member) => (
                          <div
                            key={member.id}
                            className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors"
                          >
                            <div className="size-8 rounded-full bg-gradient-to-br from-fuchsia-500/30 to-cyan-500/30 flex items-center justify-center overflow-hidden shrink-0">
                              {member.profile_picture ? (
                                <img src={member.profile_picture} alt="" className="size-full object-cover" />
                              ) : (
                                <User className="size-3.5 text-white/50" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-white/80 truncate">{member.display_name}</p>
                              {member.neighborhood && (
                                <p className="text-[10px] text-white/30 truncate">{member.neighborhood}</p>
                              )}
                            </div>
                            {member.role === "owner" && (
                              <span className="text-[10px] text-fuchsia-400/70 bg-fuchsia-500/10 px-1.5 py-0.5 rounded-full border border-fuchsia-400/20">
                                Creator
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 mt-auto pt-4 border-t border-white/10">
                  <Button
                    onClick={(e: React.MouseEvent) => { e.stopPropagation(); shareCommunity(selectedCommunity); }}
                    className="flex-1 bg-white/10 hover:bg-white/15 text-white border-0 gap-2"
                  >
                    <Send className="size-4" />
                    Share
                  </Button>
                  {selectedCommunity.created_by === user?.id ? (
                    <Button
                      onClick={startEditCommunity}
                      className="flex-1 bg-fuchsia-500/15 text-fuchsia-400 hover:bg-fuchsia-500/25 border border-fuchsia-400/20 gap-2"
                    >
                      <Pencil className="size-4" />
                      Edit
                    </Button>
                  ) : (
                    <Button
                      onClick={handleLeaveCommunity}
                      disabled={isLeavingCommunity}
                      className="flex-1 bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-400/20 gap-2"
                    >
                      {isLeavingCommunity ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <>
                          <LogOut className="size-4" />
                          Leave
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
