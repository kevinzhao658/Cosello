import { TrendingUp, TrendingDown, Search, Menu, User, DollarSign, Filter, ArrowRight, Upload, X, Plus, Loader2 } from "lucide-react";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./components/ui/dropdown-menu";
import { useState, useEffect, useRef } from "react";

interface ProductDetails {
  title: string;
  description: string;
  price: string;
  condition: string;
  location: string;
  venues: string[];
}

export default function App() {
  const [selectedGroup, setSelectedGroup] = useState("All Groups");
  const [displayText, setDisplayText] = useState("");
  const fullText = "GRAND EXCHANGE";
  const [isTypingComplete, setIsTypingComplete] = useState(false);
  const [currentLetterIndex, setCurrentLetterIndex] = useState(-1);
  const [tradeMode, setTradeMode] = useState<"buy" | "sell">("buy");

  const sellPrompt = "Upload a picture and we'll do the rest";
  const [sellDisplayText, setSellDisplayText] = useState("");
  const [isSellTypingComplete, setIsSellTypingComplete] = useState(false);
  const [sellLetterIndex, setSellLetterIndex] = useState(-1);

  const [uploadedImages, setUploadedImages] = useState<{ file: File; preview: string }[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [productDetails, setProductDetails] = useState<ProductDetails | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      setIsSellTypingComplete(false);
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
        setIsSellTypingComplete(true);
        setSellLetterIndex(-1);
      }
    }, 50);

    return () => clearInterval(typingInterval);
  }, [tradeMode]);

  return (
    <div className="size-full bg-gradient-to-br from-fuchsia-950 via-zinc-950 to-cyan-950 text-white overflow-auto">
      {/* Navigation */}
      <nav className="border-b border-white/10 bg-black/20 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center gap-8">
              <div className="flex items-center gap-2">
                <div className="relative">
                  <DollarSign className="size-8 text-fuchsia-400 absolute top-0 left-0" />
                  <DollarSign className="size-8 text-cyan-400 relative" style={{ transform: 'translate(8px, 0)' }} />
                </div>
              </div>
              
              {/* Desktop Navigation */}
              <div className="hidden md:flex gap-6">
                <button className="text-white/60 hover:text-white transition-colors bg-transparent border-none cursor-pointer">
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
              <Button variant="ghost" size="icon" className="text-white/60 hover:text-white">
                <User className="size-5" />
              </Button>
              <Button variant="ghost" size="icon" className="md:hidden text-white/60 hover:text-white">
                <Menu className="size-5" />
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
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

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-[52px] w-[52px] bg-white/5 border-white/20 hover:bg-white/10 text-white"
                        >
                          <Filter className="size-5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-zinc-900 border-white/20 text-white">
                        {["All Groups", "Weapons", "Armor", "Potions", "Materials", "Food", "Tools"].map((group) => (
                          <DropdownMenuItem
                            key={group}
                            onClick={() => setSelectedGroup(group)}
                            className="hover:bg-white/10 focus:bg-white/10"
                          >
                            {group}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>

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
                    Buying • Filter: {selectedGroup}
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
                        <label className="text-xs text-white/40 uppercase tracking-wider">Location</label>
                        <Input
                          value={productDetails.location}
                          onChange={(e) => setProductDetails({ ...productDetails, location: e.target.value })}
                          className="mt-1 bg-white/5 border-white/20 text-white"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-white/40 uppercase tracking-wider">Venues</label>
                        <div className="flex gap-2 mt-1">
                          {["Local", "Facebook"].map((venue) => (
                            <button
                              key={venue}
                              onClick={() => {
                                const venues = productDetails.venues.includes(venue)
                                  ? productDetails.venues.filter((v) => v !== venue)
                                  : [...productDetails.venues, venue];
                                setProductDetails({ ...productDetails, venues });
                              }}
                              className={`px-3 py-1.5 rounded-md text-sm border transition-all ${
                                productDetails.venues.includes(venue)
                                  ? "bg-fuchsia-500/20 border-fuchsia-400/60 text-fuchsia-400"
                                  : "bg-white/5 border-white/20 text-white/60 hover:text-white"
                              }`}
                            >
                              {venue}
                            </button>
                          ))}
                        </div>
                      </div>
                      <Button className="w-full bg-fuchsia-500 hover:bg-fuchsia-600 text-white border-0 mt-2">
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
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-black/20 backdrop-blur-sm">
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
    </div>
  );
}