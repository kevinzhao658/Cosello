import { TrendingUp, TrendingDown, Search, Menu, User, DollarSign, Filter, ArrowRight } from "lucide-react";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./components/ui/dropdown-menu";
import { useState, useEffect } from "react";

export default function App() {
  const [selectedGroup, setSelectedGroup] = useState("All Groups");
  const [displayText, setDisplayText] = useState("");
  const fullText = "GRAND  EXCHANGE";
  const [isTypingComplete, setIsTypingComplete] = useState(false);
  const [currentLetterIndex, setCurrentLetterIndex] = useState(-1);
  const [tradeMode, setTradeMode] = useState<"buy" | "sell">("buy");

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
                  className={index === currentLetterIndex ? 'animate-letter-flash' : ''}
                >
                  {letter}
                </span>
              ))}
              <span className={`inline-block w-1 h-16 sm:h-20 ml-2 ${isTypingComplete ? 'animate-cursor' : 'opacity-100 bg-cyan-400'}`}></span>
            </h2>

            {/* Search Bar with Filter */}
            <div className="max-w-4xl mx-auto">
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
                    <DropdownMenuItem 
                      onClick={() => setSelectedGroup("All Groups")}
                      className="hover:bg-white/10 focus:bg-white/10"
                    >
                      All Groups
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => setSelectedGroup("Weapons")}
                      className="hover:bg-white/10 focus:bg-white/10"
                    >
                      Weapons
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => setSelectedGroup("Armor")}
                      className="hover:bg-white/10 focus:bg-white/10"
                    >
                      Armor
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => setSelectedGroup("Potions")}
                      className="hover:bg-white/10 focus:bg-white/10"
                    >
                      Potions
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => setSelectedGroup("Materials")}
                      className="hover:bg-white/10 focus:bg-white/10"
                    >
                      Materials
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => setSelectedGroup("Food")}
                      className="hover:bg-white/10 focus:bg-white/10"
                    >
                      Food
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => setSelectedGroup("Tools")}
                      className="hover:bg-white/10 focus:bg-white/10"
                    >
                      Tools
                    </DropdownMenuItem>
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
                  className={`h-[52px] w-[52px] ${tradeMode === "buy" ? "bg-cyan-500 hover:bg-cyan-600" : "bg-fuchsia-500 hover:bg-fuchsia-600"} text-white border-0`}
                >
                  <ArrowRight className="size-5" />
                </Button>
              </div>
              
              {/* Display selected group and mode */}
              <p className="text-sm text-white/60 text-center">
                {tradeMode === "buy" ? "Buying" : "Selling"} • Filter: {selectedGroup}
              </p>
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