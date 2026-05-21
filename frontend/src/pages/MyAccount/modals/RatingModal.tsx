import { ModalShell } from "../../../components/ui/ModalShell";
import { Button } from "../../../components/ui/button";
import { X, Check, Loader2 } from "lucide-react";

export interface RatingModalOrder {
  role: string;
  buyer_name: string;
  listing_image: string;
  listing_title: string;
  listing_price: string;
}

export interface RatingModalProps {
  open: boolean;
  order: RatingModalOrder | null;
  ratingValue: number;
  ratingHover: number;
  ratingComment: string;
  isSubmitting: boolean;
  onClose: () => void;
  onHoverChange: (n: number) => void;
  onValueChange: (n: number) => void;
  onCommentChange: (s: string) => void;
  onSubmit: () => void;
}

export function RatingModal({
  open, order, ratingValue, ratingHover, ratingComment, isSubmitting,
  onClose, onHoverChange, onValueChange, onCommentChange, onSubmit,
}: RatingModalProps) {
  if (!open || !order) return null;
  return (
    <ModalShell open onClose={onClose} z={50}>
      <div className="relative border border-white/15 rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl" style={{ backgroundColor: "#18181b" }}>
        <button onClick={onClose} className="absolute top-4 right-4 text-white/40 hover:text-white/70 transition-colors">
          <X className="size-5" />
        </button>

        <div className="text-center mb-5">
          <div className="size-12 rounded-full bg-green-500/15 flex items-center justify-center mx-auto mb-3">
            <Check className="size-6 text-green-400" />
          </div>
          <h3 className="text-sm font-medium">Confirm Pickup</h3>
          <p className="text-[10px] text-white/40 mt-1">
            Rate your experience with {order.role === "buyer" ? "the seller" : order.buyer_name}.
            Both parties must confirm for the transaction to complete.
          </p>
        </div>

        <div className="flex items-center gap-3 mb-5 bg-white/[0.03] border border-white/10 rounded-lg p-3">
          <img src={order.listing_image} alt={order.listing_title} className="size-10 rounded-md object-cover border border-white/10 shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-medium truncate">{order.listing_title}</p>
            <p className="text-sm text-fuchsia-400 font-medium">${order.listing_price}</p>
          </div>
        </div>

        <div className="flex justify-center gap-1 mb-4">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              onMouseEnter={() => onHoverChange(star)}
              onMouseLeave={() => onHoverChange(0)}
              onClick={() => onValueChange(star)}
              className="p-0.5 transition-transform hover:scale-110"
            >
              <svg className={`size-7 ${(ratingHover || ratingValue) >= star ? "text-yellow-400 fill-yellow-400" : "text-white/15"}`} viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" fill="none">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
            </button>
          ))}
        </div>

        <textarea
          value={ratingComment}
          onChange={(e) => onCommentChange(e.target.value)}
          placeholder="Leave a comment (optional)..."
          className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-xs text-white/80 placeholder-white/25 resize-none h-20 mb-4 focus:outline-none focus:border-white/20"
        />

        <Button
          onClick={onSubmit}
          disabled={ratingValue === 0 || isSubmitting}
          className="w-full bg-green-500/20 hover:bg-green-500/30 border border-green-400/20 text-green-400 text-xs disabled:opacity-40"
          size="sm"
        >
          {isSubmitting ? <Loader2 className="size-3.5 animate-spin" /> : "Submit & Confirm Pickup"}
        </Button>
      </div>
    </ModalShell>
  );
}
