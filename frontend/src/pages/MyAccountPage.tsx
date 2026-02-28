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
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

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

interface MyAccountPageProps {
  onNavigate: (page: string) => void;
}

export default function MyAccountPage({ onNavigate }: MyAccountPageProps) {
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
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [copiedConfirm, setCopiedConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Create community form state
  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createNeighborhood, setCreateNeighborhood] = useState("");
  const [createIsPublic, setCreateIsPublic] = useState(true);
  const [createImage, setCreateImage] = useState<File | null>(null);
  const [createImagePreview, setCreateImagePreview] = useState<string | null>(null);
  const createImageRef = useRef<HTMLInputElement>(null);

  // Created community for confirmation modal
  const [createdCommunity, setCreatedCommunity] = useState<CommunityData | null>(null);

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
  }, [fetchCommunities]);

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
    } catch {
      setJoinError("Network error. Please try again.");
    } finally {
      setIsJoining(false);
    }
  };

  const handleCreateCommunity = async () => {
    if (!createName.trim() || !token) return;
    setIsCreating(true);
    try {
      const formData = new FormData();
      formData.append("name", createName.trim());
      if (createDescription.trim()) formData.append("description", createDescription.trim());
      if (createNeighborhood.trim()) formData.append("neighborhood", createNeighborhood.trim());
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
      resetCreateForm();
      fetchCommunities();
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
    setCreateIsPublic(true);
    setCreateImage(null);
    setCreateImagePreview(null);
  };

  const handleCreateImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCreateImage(file);
    const reader = new FileReader();
    reader.onload = () => setCreateImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const copyInviteCode = (code: string, communityId: number) => {
    navigator.clipboard.writeText(code);
    setCopiedId(communityId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const copyConfirmCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedConfirm(true);
    setTimeout(() => setCopiedConfirm(false), 2000);
  };

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
            </div>

            {/* Edit Profile */}
            <Button
              variant="outline"
              size="sm"
              className="bg-white/5 border-white/20 text-white/60 hover:text-white hover:bg-white/10 text-xs"
            >
              Edit Profile
            </Button>
          </div>
        </div>

        {/* Communities Section */}
        <div className="mb-10">
          <h2 className="text-lg font-light tracking-wider mb-4 text-white/80">Communities</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Community Tiles */}
            {communities.map((community) => (
              <div
                key={community.id}
                className="bg-white/5 border border-white/10 rounded-xl p-5 hover:bg-white/[0.07] transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="size-10 rounded-lg bg-gradient-to-br from-fuchsia-500/20 to-cyan-500/20 flex items-center justify-center overflow-hidden">
                    {community.image ? (
                      <img src={community.image} alt={community.name} className="size-full object-cover rounded-lg" />
                    ) : (
                      <Globe className="size-5 text-cyan-400" />
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {community.is_public ? (
                      <span className="text-[10px] uppercase tracking-wider text-white/30 bg-white/5 px-2 py-0.5 rounded-full border border-white/10">
                        Public
                      </span>
                    ) : (
                      <span className="text-[10px] uppercase tracking-wider text-fuchsia-400/60 bg-fuchsia-500/10 px-2 py-0.5 rounded-full border border-fuchsia-400/20">
                        Private
                      </span>
                    )}
                  </div>
                </div>
                <h3 className="text-sm font-medium mb-0.5">{community.name}</h3>
                {community.neighborhood && (
                  <p className="text-xs text-white/40 flex items-center gap-1">
                    <MapPin className="size-3" />
                    {community.neighborhood}
                  </p>
                )}
                <div className="flex items-center justify-between mt-2">
                  <p className="text-xs text-white/30">
                    {community.member_count} {community.member_count === 1 ? "member" : "members"}
                  </p>
                  <button
                    onClick={() => copyInviteCode(community.invite_code, community.id)}
                    className="text-white/25 hover:text-white/60 transition-colors p-1 -m-1"
                    title="Copy invite code"
                  >
                    {copiedId === community.id ? (
                      <Check className="size-3.5 text-green-400" />
                    ) : (
                      <Copy className="size-3.5" />
                    )}
                  </button>
                </div>
              </div>
            ))}

            {/* Join / Create Community Tile */}
            <button
              onClick={() => setShowJoinModal(true)}
              className="bg-white/[0.02] border border-dashed border-white/15 rounded-xl p-5 hover:bg-white/5 hover:border-white/25 transition-all flex flex-col items-center justify-center gap-2 min-h-[140px] cursor-pointer"
            >
              <div className="size-10 rounded-lg bg-white/5 flex items-center justify-center">
                <Plus className="size-5 text-white/40" />
              </div>
              <span className="text-xs text-white/40">Join or Create</span>
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

            <div className="space-y-3">
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
            </div>

            <div className="mt-4 pt-4 border-t border-white/5">
              <div className="flex justify-between text-xs text-white/30">
                <span>Active</span>
                <span>0</span>
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
            onClick={() => { setShowJoinModal(false); setJoinError(""); }}
          />
          <div className="relative border border-white/15 rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl" style={{ backgroundColor: "#18181b" }}>
            <button
              onClick={() => { setShowJoinModal(false); setJoinError(""); }}
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

            <p className="text-sm text-white/50 mb-4">
              Enter an invite code to join an existing community.
            </p>

            <div className="space-y-3">
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

              <div className="relative py-3">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-white/10" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="px-2 text-white/30" style={{ backgroundColor: "#18181b" }}>or</span>
                </div>
              </div>

              <Button
                onClick={() => { setShowJoinModal(false); setShowCreateModal(true); }}
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
              <div>
                <label className="text-xs text-white/50 mb-1.5 block">Community Image</label>
                <button
                  onClick={() => createImageRef.current?.click()}
                  className="w-full h-28 rounded-lg border border-dashed border-white/20 bg-white/[0.03] hover:bg-white/5 hover:border-white/30 transition-all flex flex-col items-center justify-center gap-1.5 cursor-pointer overflow-hidden"
                >
                  {createImagePreview ? (
                    <img src={createImagePreview} alt="Preview" className="size-full object-cover rounded-lg" />
                  ) : (
                    <>
                      <ImagePlus className="size-6 text-white/30" />
                      <span className="text-[11px] text-white/30">Click to upload</span>
                    </>
                  )}
                </button>
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
                <label className="text-xs text-white/50 mb-1.5 block">Description</label>
                <textarea
                  placeholder="What's this community about?"
                  value={createDescription}
                  onChange={(e) => setCreateDescription(e.target.value)}
                  rows={2}
                  className="w-full rounded-md bg-white/5 border border-white/20 text-white placeholder:text-white/30 text-sm px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500/50"
                />
              </div>

              {/* Neighborhood */}
              <div>
                <label className="text-xs text-white/50 mb-1.5 block">Neighborhood</label>
                <Input
                  type="text"
                  placeholder="e.g., Chelsea"
                  value={createNeighborhood}
                  onChange={(e) => setCreateNeighborhood(e.target.value)}
                  className="bg-white/5 border-white/20 text-white placeholder:text-white/30"
                />
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
                disabled={!createName.trim() || isCreating}
                onClick={handleCreateCommunity}
                className="w-full bg-fuchsia-500 hover:bg-fuchsia-600 text-white border-0 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isCreating ? <Loader2 className="size-4 animate-spin" /> : "Create"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmModal && createdCommunity && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowConfirmModal(false)}
          />
          <div className="relative border border-white/15 rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl" style={{ backgroundColor: "#18181b" }}>
            <button
              onClick={() => setShowConfirmModal(false)}
              className="absolute top-4 right-4 text-white/40 hover:text-white/70 transition-colors"
            >
              <X className="size-5" />
            </button>

            <div className="text-center mb-5">
              <div className="size-14 bg-green-500/15 rounded-full flex items-center justify-center mx-auto mb-3">
                <Check className="size-7 text-green-400" />
              </div>
              <h3 className="text-lg font-medium mb-1">Community Created!</h3>
              <p className="text-sm text-white/50">
                <span className="text-white/80 font-medium">{createdCommunity.name}</span> is ready to go.
              </p>
            </div>

            <div className="mb-5">
              <label className="text-xs text-white/40 mb-2 block text-center">Share this invite code with others</label>
              <div className="flex items-center gap-2 bg-white/5 border border-white/15 rounded-lg p-3">
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
                <p className="text-xs text-green-400 text-center mt-1.5">Copied to clipboard!</p>
              )}
            </div>

            <Button
              onClick={() => setShowConfirmModal(false)}
              className="w-full bg-cyan-500 hover:bg-cyan-600 text-white border-0"
            >
              Done
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
