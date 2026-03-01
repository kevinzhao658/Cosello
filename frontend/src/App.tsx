import { TrendingUp, Search, Menu, User, DollarSign, Filter, ArrowRight, Upload, X, Plus, Loader2, MapPin, Globe, Settings, ChevronRight, ExternalLink, FileText, Shield, AlertTriangle, Scale, Ban, CreditCard, MessageSquare, RefreshCw, UserCheck, Eye, LogOut, HelpCircle } from "lucide-react";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { useState, useEffect, useRef } from "react";
import { useAuth } from "./contexts/AuthContext";
import SignInPage from "./pages/SignInPage";
import SignUpPage from "./pages/SignUpPage";
import MyAccountPage from "./pages/MyAccountPage";

interface ProductDetails {
  title: string;
  description: string;
  price: string;
  condition: string;
  location: string;
  tags: string[];
}

interface Listing extends ProductDetails {
  id: string;
  imageUrl: string;
  postedAt: number;
}

type Page = "home" | "market" | "terms" | "settings" | "signin" | "signup" | "account";

export default function App() {
  const { isAuthenticated, user, token, needsRegistration, login, logout } = useAuth();

  const [selectedHomeCommunities, setSelectedHomeCommunities] = useState<string[]>([]);
  const [homeCommunityOpen, setHomeCommunityOpen] = useState(false);
  const homeCommunityRef = useRef<HTMLDivElement>(null);
  const [displayText, setDisplayText] = useState("");
  const fullText = "GRAND EXCHANGE";
  const [isTypingComplete, setIsTypingComplete] = useState(false);
  const [currentLetterIndex, setCurrentLetterIndex] = useState(-1);
  const [tradeMode, setTradeMode] = useState<"buy" | "sell">("buy");

  const sellPrompt = "Upload a picture and we'll do the rest";
  const [sellDisplayText, setSellDisplayText] = useState("");
  const [sellLetterIndex, setSellLetterIndex] = useState(-1);

  const [uploadedImages, setUploadedImages] = useState<{ file: File; preview: string }[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [productDetails, setProductDetails] = useState<ProductDetails | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [newTag, setNewTag] = useState("");
  const [page, setPage] = useState<Page>("home");
  const [showPostConfirm, setShowPostConfirm] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [listings, setListings] = useState<Listing[]>([]);
  const [marketSearch, setMarketSearch] = useState("");
  const [selectedMarketCommunities, setSelectedMarketCommunities] = useState<string[]>([]);
  const [marketCommunityOpen, setMarketCommunityOpen] = useState(false);
  const marketCommunityRef = useRef<HTMLDivElement>(null);
  const [marketSort, setMarketSort] = useState("newest");
  const [filterCommunities, setFilterCommunities] = useState<{ id: string | number; name: string; neighborhood?: string }[]>([]);
  const [selectedCommunities, setSelectedCommunities] = useState<string[]>(["My Neighborhood"]);

  // Profile dropdown state (custom, not Radix)
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  // Close home community dropdown on outside click
  useEffect(() => {
    if (!homeCommunityOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (homeCommunityRef.current?.contains(e.target as Node)) return;
      setHomeCommunityOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [homeCommunityOpen]);

  // Close market community dropdown on outside click
  useEffect(() => {
    if (!marketCommunityOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (marketCommunityRef.current?.contains(e.target as Node)) return;
      setMarketCommunityOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [marketCommunityOpen]);

  // Close profile dropdown on outside click
  useEffect(() => {
    if (!profileOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (profileRef.current?.contains(e.target as Node)) return;
      setProfileOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [profileOpen]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newImages = Array.from(files).map((file) => ({
      file,
      preview: URL.createObjectURL(file),
    }));
    setUploadedImages((prev) => [...prev, ...newImages]);
    e.target.value = "";
  };

  const removeImage = (index: number) => {
    setUploadedImages((prev) => {
      URL.revokeObjectURL(prev[index].preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleSellSubmit = async () => {
    if (uploadedImages.length === 0) return;
    setIsGenerating(true);

    try {
      const formData = new FormData();
      uploadedImages.forEach((img) => formData.append("images", img.file));

      const res = await fetch("/api/generate-listing", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Server error" }));
        throw new Error(err.detail || "Failed to generate listing");
      }

      const listing: ProductDetails = await res.json();
      setProductDetails(listing);
    } catch (err) {
      console.error("Generate listing failed:", err);
      alert(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePostListing = async () => {
    if (!productDetails || uploadedImages.length === 0) return;

    if (!isAuthenticated) {
      setPage("signin");
      return;
    }

    try {
      const formData = new FormData();
      formData.append("image", uploadedImages[0].file);
      formData.append("data", JSON.stringify(productDetails));

      const res = await fetch("/api/listings", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!res.ok) throw new Error("Failed to post listing");

      setProductDetails(null);
      setUploadedImages([]);
      setTradeMode("buy");
      setPage("market");
    } catch (err) {
      console.error("Post listing failed:", err);
      alert(err instanceof Error ? err.message : "Something went wrong");
    }
  };

  const handleLogout = async () => {
    setProfileOpen(false);
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // ignore
    }
    logout();
    setPage("home");
  };

  const fetchFilterCommunities = async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/communities/mine-with-neighborhood", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setFilterCommunities(data);
      }
    } catch (err) {
      console.error("Failed to fetch communities:", err);
    }
  };

  useEffect(() => {
    if (isAuthenticated) fetchFilterCommunities();
  }, [isAuthenticated]);

  const fetchListings = async () => {
    const params = new URLSearchParams();
    if (marketSearch) params.set("search", marketSearch);
    if (selectedMarketCommunities.length > 0) {
      params.set("community", selectedMarketCommunities.join(","));
      if (selectedMarketCommunities.includes("neighborhood") && user?.neighborhood) {
        params.set("neighborhood", user.neighborhood);
      }
    }
    params.set("sort", marketSort);

    try {
      const res = await fetch(`/api/listings?${params}`);
      if (res.ok) {
        const data: Listing[] = await res.json();
        setListings(data);
      }
    } catch (err) {
      console.error("Failed to fetch listings:", err);
    }
  };

  useEffect(() => {
    if (page === "market") fetchListings();
  }, [page, marketSearch, selectedMarketCommunities, marketSort]);

  useEffect(() => {
    let currentIndex = 0;
    const typingInterval = setInterval(() => {
      if (currentIndex <= fullText.length) {
        setDisplayText(fullText.slice(0, currentIndex));
        setCurrentLetterIndex(currentIndex - 1);
        currentIndex++;
      } else {
        clearInterval(typingInterval);
        setIsTypingComplete(true);
        setCurrentLetterIndex(-1);
      }
    }, 80);

    return () => clearInterval(typingInterval);
  }, []);

  useEffect(() => {
    if (tradeMode !== "sell") {
      setSellDisplayText("");
      setSellLetterIndex(-1);
      return;
    }

    let currentIndex = 0;
    const typingInterval = setInterval(() => {
      if (currentIndex <= sellPrompt.length) {
        setSellDisplayText(sellPrompt.slice(0, currentIndex));
        setSellLetterIndex(currentIndex - 1);
        currentIndex++;
      } else {
        clearInterval(typingInterval);
        setSellLetterIndex(-1);
      }
    }, 25);

    return () => clearInterval(typingInterval);
  }, [tradeMode]);

  // If user needs registration, redirect to signup
  useEffect(() => {
    if (needsRegistration && page !== "signup") {
      setPage("signup");
    }
  }, [needsRegistration]);

  return (
    <div className="size-full bg-gradient-to-br from-fuchsia-950 via-zinc-950 to-cyan-950 text-white overflow-auto">
      {/* Navigation */}
      <nav className="border-b border-white/10 bg-black/20 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center gap-8">
              <button onClick={() => setPage("home")} className="flex items-center gap-2 bg-transparent border-none cursor-pointer">
                <div className="relative">
                  <DollarSign className="size-8 text-fuchsia-400 absolute top-0 left-0" />
                  <DollarSign className="size-8 text-cyan-400 relative" style={{ transform: 'translate(8px, 0)' }} />
                </div>
              </button>

              {/* Desktop Navigation */}
              <div className="hidden md:flex gap-6">
                <button onClick={() => setPage("market")} className={`hover:text-white transition-colors bg-transparent border-none cursor-pointer ${page === "market" ? "text-white" : "text-white/60"}`}>
                  Market
                </button>
                <button className="text-white/60 hover:text-white transition-colors bg-transparent border-none cursor-pointer">
                  My Items
                </button>
                <button className="text-white/60 hover:text-white transition-colors bg-transparent border-none cursor-pointer">
                  History
                </button>
              </div>
            </div>

            {/* Right Side */}
            <div className="flex items-center gap-4">
              {isAuthenticated ? (
                <div className="relative" ref={profileRef}>
                  <button
                    onClick={() => setProfileOpen((prev) => !prev)}
                    className="flex items-center justify-center size-9 rounded-full bg-white/5 hover:bg-white/15 transition-colors cursor-pointer border border-white/10 overflow-hidden"
                  >
                    {user?.profile_picture ? (
                      <img src={user.profile_picture} alt="" className="size-full object-cover" />
                    ) : (
                      <User className="size-4 text-white/80" />
                    )}
                  </button>

                  {profileOpen && (
                    <div className="absolute right-0 top-full mt-1.5 w-44 rounded-md border border-white/15 shadow-xl overflow-hidden z-50" style={{ backgroundColor: '#18181b' }}>
                      {user?.display_name && (
                        <div className="px-3 py-2 border-b border-white/10">
                          <p className="text-xs font-medium truncate">{user.display_name}</p>
                          <p className="text-[11px] text-white/40 truncate">{user.neighborhood}</p>
                        </div>
                      )}

                      <div className="py-0.5">
                        <button
                          onClick={() => { setProfileOpen(false); setPage("account"); }}
                          className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10 hover:text-white transition-colors text-left"
                        >
                          <User className="size-3.5" />
                          My Account
                        </button>
                        <button
                          onClick={() => { setProfileOpen(false); setPage("settings"); }}
                          className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10 hover:text-white transition-colors text-left"
                        >
                          <Settings className="size-3.5" />
                          Settings
                        </button>
                        <button
                          onClick={() => { setProfileOpen(false); /* TODO: help page */ }}
                          className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10 hover:text-white transition-colors text-left"
                        >
                          <HelpCircle className="size-3.5" />
                          Help & Support
                        </button>
                      </div>

                      <div className="border-t border-white/10 py-0.5">
                        <button
                          onClick={handleLogout}
                          className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-red-400 hover:bg-white/10 hover:text-red-300 transition-colors text-left"
                        >
                          <LogOut className="size-3.5" />
                          Log Out
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <Button
                  onClick={() => setPage("signin")}
                  variant="outline"
                  size="sm"
                  className="bg-white/5 border-white/20 text-white hover:bg-white/10 text-sm"
                >
                  Log In
                </Button>
              )}

              <Button variant="ghost" size="icon" className="md:hidden text-white/60 hover:text-white">
                <Menu className="size-5" />
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Sign In Page */}
      {page === "signin" && (
        <SignInPage
          onSuccess={(newToken, userExists, newUser) => {
            login(newToken, newUser);
            if (!userExists || !newUser?.display_name || !newUser?.neighborhood) {
              setPage("signup");
            } else {
              setPage("home");
            }
          }}
          onCancel={() => setPage("home")}
        />
      )}

      {/* Sign Up Page */}
      {page === "signup" && (
        <SignUpPage onComplete={() => setPage("account")} />
      )}

      {page === "home" && (
        <>
      {/* Hero Section */}
      <section className="min-h-[calc(100vh-64px)] flex flex-col justify-center px-4 sm:px-6 lg:px-8 py-12">
        <div className="max-w-7xl mx-auto w-full">
          <div className="text-center mb-12">
            <h2 className="text-6xl sm:text-7xl mb-12 font-light tracking-widest inline-flex items-center justify-center" style={{ fontFamily: "'Courier Prime', monospace" }}>
              {displayText.split('').map((letter, index) => (
                <span
                  key={index}
                  className={`${index === currentLetterIndex ? 'animate-letter-flash' : ''}${letter === ' ' ? ' inline-block w-4 sm:w-6' : ''}`}
                >
                  {letter === ' ' ? '\u00A0' : letter}
                </span>
              ))}
              <span className={`inline-block w-1 h-16 sm:h-20 ml-2 ${isTypingComplete ? 'animate-cursor' : 'opacity-100 bg-cyan-400'}`}></span>
            </h2>

            {/* Search Bar / Sell Upload */}
            <div className="max-w-4xl mx-auto">
              {tradeMode === "buy" ? (
                <>
                  <div className="relative flex items-center gap-2 mb-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-white/40 size-5" />
                      <Input
                        type="text"
                        placeholder="Search for items..."
                        className="w-full pl-12 pr-4 py-6 text-lg bg-white/5 border-white/20 text-white placeholder:text-white/40 focus:border-cyan-400"
                      />
                    </div>

                    <div className="relative" ref={homeCommunityRef}>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setHomeCommunityOpen((prev) => !prev)}
                        className="h-[52px] w-[52px] bg-white/5 border-white/20 hover:bg-white/10 text-white"
                      >
                        <Filter className="size-5" />
                      </Button>
                      {homeCommunityOpen && (
                        <div className="absolute right-0 top-full mt-1 min-w-[180px] rounded-lg border border-white/20 shadow-xl z-50 py-1 max-h-52 overflow-y-auto" style={{ backgroundColor: "#18181b" }}>
                          <button
                            onClick={() => setSelectedHomeCommunities([])}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-white/10 transition-colors text-white"
                          >
                            <span className={`text-xs ${selectedHomeCommunities.length === 0 ? "opacity-100" : "opacity-0"}`}>✓</span>
                            All
                          </button>
                          {filterCommunities.map((c) => {
                            const cid = String(c.id);
                            const checked = selectedHomeCommunities.includes(cid);
                            return (
                              <button
                                key={cid}
                                onClick={() =>
                                  setSelectedHomeCommunities((prev) =>
                                    checked ? prev.filter((x) => x !== cid) : [...prev, cid]
                                  )
                                }
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-white/10 transition-colors text-white"
                              >
                                <span className={`text-xs ${checked ? "opacity-100" : "opacity-0"}`}>✓</span>
                                {c.name}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Buy/Sell Toggle */}
                    <div className="flex bg-white/5 border border-white/20 rounded-lg overflow-hidden">
                      <Button
                        variant="ghost"
                        onClick={() => setTradeMode("buy")}
                        className={`h-[52px] px-4 rounded-none text-sm ${
                          tradeMode === "buy"
                            ? "bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30"
                            : "text-white/60 hover:text-white hover:bg-white/5"
                        }`}
                      >
                        Buy
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => setTradeMode("sell")}
                        className={`h-[52px] px-4 rounded-none text-sm ${
                          tradeMode === "sell"
                            ? "bg-fuchsia-500/20 text-fuchsia-400 hover:bg-fuchsia-500/30"
                            : "text-white/60 hover:text-white hover:bg-white/5"
                        }`}
                      >
                        Sell
                      </Button>
                    </div>

                    {/* Submit Button */}
                    <Button
                      size="icon"
                      className="h-[52px] w-[52px] bg-cyan-500 hover:bg-cyan-600 text-white border-0"
                    >
                      <ArrowRight className="size-5" />
                    </Button>
                  </div>

                  <p className="text-sm text-white/60 text-center">
                    Buying • {selectedHomeCommunities.length === 0
                      ? "All Communities"
                      : filterCommunities
                          .filter((c) => selectedHomeCommunities.includes(String(c.id)))
                          .map((c) => c.name)
                          .join(", ")}
                  </p>
                </>
              ) : (
                <>
                  {/* Sell Upload Area */}
                  <div className="relative flex items-center gap-2 mb-2">
                    <label className="flex-1 flex items-center gap-3 px-4 py-3 bg-white/5 border border-dashed border-fuchsia-400/40 rounded-lg cursor-pointer hover:bg-white/10 hover:border-fuchsia-400/60 transition-all">
                      <Upload className="size-5 text-fuchsia-400 shrink-0" />
                      <p className="text-sm inline-flex items-center" style={{ fontFamily: "'Courier Prime', monospace" }}>
                        {sellDisplayText.split('').map((letter, index) => (
                          <span
                            key={index}
                            className={`${index === sellLetterIndex ? 'animate-letter-flash' : 'text-white/70'}${letter === ' ' ? ' inline-block w-1.5' : ''}`}
                          >
                            {letter === ' ' ? '\u00A0' : letter}
                          </span>
                        ))}
                      </p>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={handleImageUpload}
                      />
                    </label>

                    {/* Buy/Sell Toggle */}
                    <div className="flex bg-white/5 border border-white/20 rounded-lg overflow-hidden">
                      <Button
                        variant="ghost"
                        onClick={() => setTradeMode("buy")}
                        className={`h-[52px] px-4 rounded-none text-sm ${
                          tradeMode === "buy"
                            ? "bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30"
                            : "text-white/60 hover:text-white hover:bg-white/5"
                        }`}
                      >
                        Buy
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => setTradeMode("sell")}
                        className={`h-[52px] px-4 rounded-none text-sm ${
                          tradeMode === "sell"
                            ? "bg-fuchsia-500/20 text-fuchsia-400 hover:bg-fuchsia-500/30"
                            : "text-white/60 hover:text-white hover:bg-white/5"
                        }`}
                      >
                        Sell
                      </Button>
                    </div>

                    {/* Submit Button */}
                    <Button
                      size="icon"
                      disabled={uploadedImages.length === 0 || isGenerating}
                      onClick={handleSellSubmit}
                      className={`h-[52px] w-[52px] bg-fuchsia-500 hover:bg-fuchsia-600 text-white border-0 ${uploadedImages.length === 0 ? 'opacity-40 cursor-not-allowed' : ''}`}
                    >
                      {isGenerating ? <Loader2 className="size-5 animate-spin" /> : <ArrowRight className="size-5" />}
                    </Button>
                  </div>

                  {/* Thumbnail Previews */}
                  {uploadedImages.length > 0 && (
                    <div className="flex items-center gap-2 mt-3 mb-2">
                      {uploadedImages.map((img, index) => (
                        <div key={index} className="relative group">
                          <img
                            src={img.preview}
                            alt={`Upload ${index + 1}`}
                            className="size-16 object-cover rounded-lg border border-white/20"
                          />
                          <button
                            onClick={() => removeImage(index)}
                            className="absolute -top-1.5 -right-1.5 size-5 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="size-3 text-white" />
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="size-16 rounded-lg border border-dashed border-white/20 flex items-center justify-center text-white/40 hover:text-white/60 hover:border-white/40 transition-all"
                      >
                        <Plus className="size-5" />
                      </button>
                    </div>
                  )}

                  {/* Auto-Generated Product Details */}
                  {isGenerating && (
                    <div className="mt-6 p-6 bg-white/5 rounded-lg border border-white/10 text-center">
                      <Loader2 className="size-6 text-fuchsia-400 animate-spin mx-auto mb-3" />
                      <p className="text-white/60 text-sm">Analyzing your images...</p>
                    </div>
                  )}

                  {productDetails && !isGenerating && (
                    <div className="mt-6 p-6 bg-white/5 rounded-lg border border-white/10 space-y-4 text-left">
                      <div>
                        <label className="text-xs text-white/40 uppercase tracking-wider">Title</label>
                        <Input
                          value={productDetails.title}
                          onChange={(e) => setProductDetails({ ...productDetails, title: e.target.value })}
                          className="mt-1 bg-white/5 border-white/20 text-white"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-white/40 uppercase tracking-wider">Description</label>
                        <textarea
                          value={productDetails.description}
                          onChange={(e) => setProductDetails({ ...productDetails, description: e.target.value })}
                          rows={3}
                          className="mt-1 w-full bg-white/5 border border-white/20 text-white rounded-md px-3 py-2 text-sm focus:outline-none focus:border-fuchsia-400 resize-none"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs text-white/40 uppercase tracking-wider">Price ($)</label>
                          <Input
                            value={productDetails.price}
                            onChange={(e) => setProductDetails({ ...productDetails, price: e.target.value })}
                            className="mt-1 bg-white/5 border-white/20 text-white"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-white/40 uppercase tracking-wider">Condition</label>
                          <select
                            value={productDetails.condition}
                            onChange={(e) => setProductDetails({ ...productDetails, condition: e.target.value })}
                            className="mt-1 w-full bg-white/5 border border-white/20 text-white rounded-md px-3 py-2 text-sm focus:outline-none focus:border-fuchsia-400 h-9"
                          >
                            <option value="New">New</option>
                            <option value="Like New">Like New</option>
                            <option value="Good">Good</option>
                            <option value="Fair">Fair</option>
                            <option value="Poor">Poor</option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-white/40 uppercase tracking-wider">Tags</label>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {productDetails.tags.map((tag, index) => (
                            <span
                              key={index}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-fuchsia-500/15 border border-fuchsia-400/30 text-fuchsia-300"
                            >
                              {tag}
                              <button
                                onClick={() =>
                                  setProductDetails({
                                    ...productDetails,
                                    tags: productDetails.tags.filter((_, i) => i !== index),
                                  })
                                }
                                className="hover:text-white transition-colors"
                              >
                                <X className="size-3" />
                              </button>
                            </span>
                          ))}
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              const trimmed = newTag.trim();
                              if (trimmed && !productDetails.tags.includes(trimmed)) {
                                setProductDetails({
                                  ...productDetails,
                                  tags: [...productDetails.tags, trimmed],
                                });
                                setNewTag("");
                              }
                            }}
                            className="inline-flex"
                          >
                            <input
                              value={newTag}
                              onChange={(e) => setNewTag(e.target.value)}
                              placeholder="Add tag..."
                              className="w-20 px-2 py-1 rounded-full text-xs bg-white/5 border border-white/20 text-white placeholder:text-white/30 focus:outline-none focus:border-fuchsia-400 transition-colors"
                            />
                          </form>
                        </div>
                      </div>
                      {/* Post To */}
                      <div>
                        <label className="text-xs text-white/40 uppercase tracking-wider">Post to</label>
                        <div className="mt-2 space-y-2">
                          {filterCommunities.map((community) => {
                            const isSelected = selectedCommunities.includes(community.name);
                            return (
                              <button
                                key={String(community.id)}
                                onClick={() =>
                                  setSelectedCommunities((prev) =>
                                    isSelected
                                      ? prev.filter((c) => c !== community.name)
                                      : [...prev, community.name]
                                  )
                                }
                                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-sm text-left transition-all ${
                                  isSelected
                                    ? "bg-fuchsia-500/10 border-fuchsia-400/40 text-fuchsia-300"
                                    : "bg-white/5 border-white/20 text-white/40"
                                }`}
                              >
                                <Globe className="size-4 shrink-0" />
                                <span className="flex-1">{community.name}</span>
                                {community.neighborhood && (
                                  <span className={`text-xs flex items-center gap-1 ${isSelected ? "text-fuchsia-400/50" : "text-white/30"}`}>
                                    <MapPin className="size-3" />
                                    {community.neighborhood}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <Button
                        onClick={() => setShowPostConfirm(true)}
                        disabled={selectedCommunities.length === 0}
                        className={`w-full bg-fuchsia-500 hover:bg-fuchsia-600 text-white border-0 mt-2 ${selectedCommunities.length === 0 ? "opacity-40 cursor-not-allowed" : ""}`}
                      >
                        Post Listing
                      </Button>
                    </div>
                  )}

                  {!productDetails && !isGenerating && (
                    <p className="text-sm text-white/60 text-center mt-2">
                      {uploadedImages.length > 0
                        ? `${uploadedImages.length} photo${uploadedImages.length > 1 ? 's' : ''} ready • Hit submit to generate listing`
                        : "Selling • Click above to upload photos"}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-black/20 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="text-4xl bg-gradient-to-r from-fuchsia-400 to-cyan-400 bg-clip-text text-transparent mb-2">1.2M+</div>
              <div className="text-white/60">Active Traders</div>
            </div>
            <div className="text-center">
              <div className="text-4xl bg-gradient-to-r from-fuchsia-400 to-cyan-400 bg-clip-text text-transparent mb-2">5.8M+</div>
              <div className="text-white/60">Items Listed</div>
            </div>
            <div className="text-center">
              <div className="text-4xl bg-gradient-to-r from-fuchsia-400 to-cyan-400 bg-clip-text text-transparent mb-2">$2.4B+</div>
              <div className="text-white/60">Total Trading Volume</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <h3 className="text-3xl text-center mb-12">Why Choose Grand Exchange?</h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-white/5 p-8 rounded-lg border border-white/10 backdrop-blur-sm">
              <div className="size-12 bg-gradient-to-br from-fuchsia-500/20 to-cyan-500/20 rounded-lg flex items-center justify-center mb-4">
                <TrendingUp className="size-6 text-cyan-400" />
              </div>
              <h4 className="text-xl mb-3">Instant Trading</h4>
              <p className="text-white/60">
                Buy and sell items instantly with our automated matching system. No waiting required.
              </p>
            </div>

            <div className="bg-white/5 p-8 rounded-lg border border-white/10 backdrop-blur-sm">
              <div className="size-12 bg-gradient-to-br from-fuchsia-500/20 to-cyan-500/20 rounded-lg flex items-center justify-center mb-4">
                <svg className="size-6 text-fuchsia-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h4 className="text-xl mb-3">Secure Transactions</h4>
              <p className="text-white/60">
                Your items and payments are protected with bank-level security and escrow services.
              </p>
            </div>

            <div className="bg-white/5 p-8 rounded-lg border border-white/10 backdrop-blur-sm">
              <div className="size-12 bg-gradient-to-br from-fuchsia-500/20 to-cyan-500/20 rounded-lg flex items-center justify-center mb-4">
                <svg className="size-6 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
              <h4 className="text-xl mb-3">Real-Time Prices</h4>
              <p className="text-white/60">
                Get accurate market data and price history to make informed trading decisions.
              </p>
            </div>
          </div>
        </div>
      </section>
        </>
      )}

      {page === "market" && (
        <section className="py-12 px-4 sm:px-6 lg:px-8 min-h-[calc(100vh-64px)]">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-light tracking-wider mb-8" style={{ fontFamily: "'Courier Prime', monospace" }}>
              Marketplace
            </h2>

            {/* Search, Filter & Sort Bar */}
            <div className="flex flex-col sm:flex-row sm:items-end gap-3 mb-8">
              <div className="flex flex-col flex-1">
                <label className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Search</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 size-4" />
                  <input
                    type="text"
                    value={marketSearch}
                    onChange={(e) => setMarketSearch(e.target.value)}
                    placeholder="Search items..."
                    className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/20 rounded-lg text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-cyan-400 transition-colors"
                  />
                </div>
              </div>

              <div className="flex flex-col relative" ref={marketCommunityRef}>
                <label className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Community</label>
                <button
                  onClick={() => setMarketCommunityOpen((prev) => !prev)}
                  className="px-3 py-2.5 bg-white/5 border border-white/20 rounded-lg text-sm text-white text-left min-w-[160px] focus:outline-none focus:border-cyan-400 transition-colors flex items-center justify-between gap-2"
                >
                  <span className="truncate">
                    {selectedMarketCommunities.length === 0
                      ? "All"
                      : filterCommunities
                          .filter((c) => selectedMarketCommunities.includes(String(c.id)))
                          .map((c) => c.name)
                          .join(", ") || "All"}
                  </span>
                  <ChevronRight className="size-3 text-white/40 rotate-90 shrink-0" />
                </button>
                {marketCommunityOpen && (
                  <div className="absolute top-full left-0 mt-1 w-full min-w-[180px] rounded-lg border border-white/20 shadow-xl z-50 py-1 max-h-52 overflow-y-auto" style={{ backgroundColor: "#18181b" }}>
                    <button
                      onClick={() => setSelectedMarketCommunities([])}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-white/10 transition-colors text-white"
                    >
                      <span className={`text-xs ${selectedMarketCommunities.length === 0 ? "opacity-100" : "opacity-0"}`}>✓</span>
                      All
                    </button>
                    {filterCommunities.map((c) => {
                      const cid = String(c.id);
                      const checked = selectedMarketCommunities.includes(cid);
                      return (
                        <button
                          key={cid}
                          onClick={() =>
                            setSelectedMarketCommunities((prev) =>
                              checked ? prev.filter((x) => x !== cid) : [...prev, cid]
                            )
                          }
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-white/10 transition-colors text-white"
                        >
                          <span className={`text-xs ${checked ? "opacity-100" : "opacity-0"}`}>✓</span>
                          {c.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex flex-col">
                <label className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Sort By</label>
                <select
                  value={marketSort}
                  onChange={(e) => setMarketSort(e.target.value)}
                  className="px-3 py-2.5 bg-white/5 border border-white/20 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-400 transition-colors"
                >
                  <option value="newest">Newest</option>
                  <option value="best_match">Best Match</option>
                  <option value="price_low">Price: Low to High</option>
                  <option value="price_high">Price: High to Low</option>
                </select>
              </div>
            </div>

            {/* Listings */}
            {listings.length === 0 ? (
              <div className="text-center py-20">
                <p className="text-white/40 text-lg">{marketSearch || selectedMarketCommunities.length > 0 ? "No matching listings" : "No listings yet"}</p>
                {!marketSearch && selectedMarketCommunities.length === 0 && (
                  <Button
                    onClick={() => { setPage("home"); setTradeMode("sell"); }}
                    className="mt-4 bg-fuchsia-500 hover:bg-fuchsia-600 text-white border-0"
                  >
                    Create your first listing
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {listings.map((listing) => (
                  <div
                    key={listing.id}
                    className="flex gap-5 p-4 bg-white/5 rounded-lg border border-white/10 hover:bg-white/[0.07] transition-colors"
                  >
                    <img
                      src={listing.imageUrl}
                      alt={listing.title}
                      className="w-28 h-28 object-cover rounded-lg border border-white/10 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="text-lg font-medium truncate">{listing.title}</h3>
                        <span className="text-lg font-semibold text-fuchsia-400 shrink-0">${listing.price}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-1.5 text-sm text-white/50">
                        <span className="px-2 py-0.5 rounded bg-white/10 text-xs">{listing.condition}</span>
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="size-3" />
                          {listing.location}
                        </span>
                      </div>
                      {listing.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2.5">
                          {listing.tags.map((tag, i) => (
                            <span key={i} className="px-2 py-0.5 rounded-full text-xs bg-fuchsia-500/10 border border-fuchsia-400/20 text-fuchsia-300">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Terms & Conditions Page */}
      {page === "terms" && (
        <section className="py-12 px-4 sm:px-6 lg:px-8 min-h-[calc(100vh-64px)]">
          <div className="max-w-3xl mx-auto">
            <button
              onClick={() => setPage("settings")}
              className="text-sm text-white/40 hover:text-white/60 transition-colors mb-6 flex items-center gap-1"
            >
              <ChevronRight className="size-3 rotate-180" />
              Back to Settings
            </button>

            <div className="flex items-center gap-3 mb-8">
              <Scale className="size-7 text-fuchsia-400" />
              <h2 className="text-3xl font-light tracking-wider" style={{ fontFamily: "'Courier Prime', monospace" }}>
                Terms & Conditions
              </h2>
            </div>

            <div className="space-y-8 text-sm text-white/70 leading-relaxed">
              <p className="text-white/40 text-xs">Last updated: February 27, 2026</p>

              <div>
                <h3 className="text-lg text-white mb-3 flex items-center gap-2">
                  <FileText className="size-4 text-cyan-400" />
                  1. Acceptance of Terms
                </h3>
                <p>
                  By accessing or using Grand Exchange ("the Platform"), you agree to be bound by these Terms & Conditions.
                  If you do not agree, you may not use the Platform. Grand Exchange reserves the right to modify these terms
                  at any time, and continued use constitutes acceptance of any changes.
                </p>
              </div>

              <div>
                <h3 className="text-lg text-white mb-3 flex items-center gap-2">
                  <UserCheck className="size-4 text-cyan-400" />
                  2. Eligibility
                </h3>
                <p>
                  You must be at least 18 years old to use Grand Exchange. By creating an account, you represent that you are
                  of legal age and have the legal capacity to enter into a binding agreement. Accounts are limited to one per
                  individual and are non-transferable.
                </p>
              </div>

              <div>
                <h3 className="text-lg text-white mb-3 flex items-center gap-2">
                  <Shield className="size-4 text-cyan-400" />
                  3. User Accounts & Responsibilities
                </h3>
                <ul className="list-disc list-inside space-y-1.5 ml-2">
                  <li>You are responsible for maintaining the confidentiality of your account credentials.</li>
                  <li>All activity under your account is your responsibility.</li>
                  <li>You must provide accurate, current, and complete information during registration and in all listings.</li>
                  <li>You agree to promptly update your account information if it changes.</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg text-white mb-3 flex items-center gap-2">
                  <CreditCard className="size-4 text-cyan-400" />
                  4. Listings & Transactions
                </h3>
                <ul className="list-disc list-inside space-y-1.5 ml-2">
                  <li>Sellers must accurately describe items including condition, defects, and any relevant details.</li>
                  <li>Prices listed must be in US Dollars and reflect the actual asking price.</li>
                  <li>By posting a listing, you confirm that you legally own the item or are authorized to sell it.</li>
                  <li>Sellers agree to make items available for pickup within <strong className="text-white">7 days</strong> of posting.</li>
                  <li>Grand Exchange is a platform connecting buyers and sellers — it is not a party to any transaction between users.</li>
                  <li>All sales are final unless both parties mutually agree to a return or exchange.</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg text-white mb-3 flex items-center gap-2">
                  <MapPin className="size-4 text-cyan-400" />
                  5. Pickup & Delivery
                </h3>
                <ul className="list-disc list-inside space-y-1.5 ml-2">
                  <li>All transactions default to local pickup at the seller's designated pickup location.</li>
                  <li>Sellers and buyers must agree on a mutually convenient and safe meeting location.</li>
                  <li>Grand Exchange recommends meeting in well-lit, public spaces during daytime hours.</li>
                  <li>Grand Exchange is not responsible for any incidents during pickup or delivery.</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg text-white mb-3 flex items-center gap-2">
                  <Eye className="size-4 text-cyan-400" />
                  6. Community Guidelines
                </h3>
                <ul className="list-disc list-inside space-y-1.5 ml-2">
                  <li>Treat all users with respect. Harassment, threats, or abusive behavior will result in account suspension.</li>
                  <li>Do not post misleading, fraudulent, or deceptive listings.</li>
                  <li>Respect community-specific rules and norms when posting to private communities.</li>
                  <li>Spam, duplicate listings, or manipulative behavior (fake reviews, price manipulation) is prohibited.</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg text-white mb-3 flex items-center gap-2">
                  <Ban className="size-4 text-cyan-400" />
                  7. Prohibited Items
                </h3>
                <p className="mb-2">The following may not be listed or sold on Grand Exchange:</p>
                <ul className="list-disc list-inside space-y-1.5 ml-2">
                  <li>Illegal substances, drugs, or drug paraphernalia</li>
                  <li>Weapons, firearms, ammunition, or explosives</li>
                  <li>Stolen property or items you do not have the right to sell</li>
                  <li>Counterfeit, replica, or knockoff goods</li>
                  <li>Hazardous materials or recalled products</li>
                  <li>Living animals (pet adoption services excluded)</li>
                  <li>Any item prohibited by local, state, or federal law</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg text-white mb-3 flex items-center gap-2">
                  <MessageSquare className="size-4 text-cyan-400" />
                  8. Dispute Resolution
                </h3>
                <p>
                  Grand Exchange encourages buyers and sellers to resolve disputes directly. If a resolution cannot be reached,
                  users may submit a dispute through our support channel. Grand Exchange may mediate but is not obligated to
                  resolve disputes and shall not be held liable for the outcome of any transaction. Any unresolved legal disputes
                  shall be governed by the laws of the State of New York.
                </p>
              </div>

              <div>
                <h3 className="text-lg text-white mb-3 flex items-center gap-2">
                  <AlertTriangle className="size-4 text-cyan-400" />
                  9. Limitation of Liability
                </h3>
                <p>
                  Grand Exchange is provided "as is" without warranties of any kind. To the fullest extent permitted by law,
                  Grand Exchange shall not be liable for any indirect, incidental, special, consequential, or punitive damages
                  arising from your use of the Platform, including but not limited to loss of profits, data, or goodwill.
                  Our total liability for any claim shall not exceed the amount you paid to Grand Exchange (if any) in the
                  12 months preceding the claim.
                </p>
              </div>

              <div>
                <h3 className="text-lg text-white mb-3 flex items-center gap-2">
                  <RefreshCw className="size-4 text-cyan-400" />
                  10. Modifications & Termination
                </h3>
                <p>
                  Grand Exchange reserves the right to modify, suspend, or discontinue any part of the Platform at any time.
                  We may terminate or suspend your account at our discretion if you violate these terms. Upon termination,
                  your right to use the Platform ceases immediately, but sections regarding liability, disputes, and
                  intellectual property survive termination.
                </p>
              </div>

              <div className="pt-4 border-t border-white/10">
                <p className="text-white/40">
                  If you have questions about these terms, contact us at <span className="text-cyan-400">support@grandexchange.app</span>.
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Settings Page */}
      {page === "settings" && (
        <section className="py-12 px-4 sm:px-6 lg:px-8 min-h-[calc(100vh-64px)]">
          <div className="max-w-2xl mx-auto">
            <h2 className="text-3xl font-light tracking-wider mb-8" style={{ fontFamily: "'Courier Prime', monospace" }}>
              Settings
            </h2>

            <div className="space-y-2">
              <button
                onClick={() => setPage("terms")}
                className="w-full flex items-center justify-between px-4 py-3.5 bg-white/5 border border-white/10 rounded-lg hover:bg-white/[0.07] transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <Scale className="size-5 text-fuchsia-400" />
                  <span className="text-sm">Terms & Conditions</span>
                </div>
                <ChevronRight className="size-4 text-white/30" />
              </button>
            </div>
          </div>
        </section>
      )}

      {/* My Account Page */}
      {page === "account" && (
        <MyAccountPage onNavigate={(p) => setPage(p as Page)} onCommunitiesChanged={fetchFilterCommunities} />
      )}

      {/* Post Listing Confirmation Modal */}
      {showPostConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => { setShowPostConfirm(false); setAcceptedTerms(false); }}
          />
          <div className="relative bg-zinc-900 border border-white/15 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
            <button
              onClick={() => { setShowPostConfirm(false); setAcceptedTerms(false); }}
              className="absolute top-4 right-4 text-white/40 hover:text-white/70 transition-colors"
            >
              <X className="size-5" />
            </button>

            <div className="flex items-center gap-3 mb-5">
              <div className="size-10 bg-fuchsia-500/15 rounded-full flex items-center justify-center">
                <AlertTriangle className="size-5 text-fuchsia-400" />
              </div>
              <h3 className="text-lg font-medium">Confirm Listing</h3>
            </div>

            <div className="space-y-4 mb-6">
              <p className="text-sm text-white/70">
                Please review before posting.
              </p>

              <p className="text-sm text-white/60 italic">
                This item must be available for pickup within 7 days of posting.
              </p>

              <label className="flex items-start gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                  className="mt-0.5 size-4 rounded border-white/30 bg-white/5 accent-fuchsia-500 cursor-pointer"
                />
                <span className="text-sm text-white/60 group-hover:text-white/80 transition-colors">
                  I agree to the{" "}
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      setShowPostConfirm(false);
                      setAcceptedTerms(false);
                      setPage("terms");
                    }}
                    className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2 transition-colors inline-flex items-center gap-1"
                  >
                    Terms & Conditions
                    <ExternalLink className="size-3" />
                  </button>
                </span>
              </label>
            </div>

            <div className="flex gap-3">
              <Button
                onClick={() => { setShowPostConfirm(false); setAcceptedTerms(false); }}
                variant="outline"
                className="flex-1 border-white/20 text-white/60 hover:text-white hover:bg-white/5"
              >
                Cancel
              </Button>
              <Button
                disabled={!acceptedTerms}
                onClick={() => {
                  setShowPostConfirm(false);
                  setAcceptedTerms(false);
                  handlePostListing();
                }}
                className="flex-1 bg-fuchsia-500 hover:bg-fuchsia-600 text-white border-0 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Confirm & Post
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
