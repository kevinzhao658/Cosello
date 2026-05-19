import { ModalShell } from "../../../components/ui/ModalShell";
import { Button } from "../../../components/ui/button";
import { X, Check, Loader2 } from "lucide-react";
import { FOCUS_RING } from "../constants";

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
      <div className="relative bg-canvas border border-hairline rounded-md max-w-sm w-full mx-4 shadow-overlay">
        <button
          onClick={onClose}
          aria-label="Close"
          className={`absolute top-3 right-3 size-9 rounded-full text-muted hover:text-ink hover:bg-surface-soft inline-flex items-center justify-center ${FOCUS_RING}`}
        >
          <X className="size-5" />
        </button>

        <div className="px-6 pt-6 pb-4">
          <div className="text-center mb-5">
            <div className="size-12 rounded-full bg-primary-soft flex items-center justify-center mx-auto mb-3">
              <Check className="size-6 text-primary" />
            </div>
            <h3 className="text-xl font-extrabold text-ink tracking-display">Confirm Pickup</h3>
            <p className="text-sm text-muted mt-1">
              Rate your experience with {order.role === "buyer" ? "the seller" : order.buyer_name}.
              Both parties must confirm for the transaction to complete.
            </p>
          </div>

          <div className="flex items-center gap-3 mb-5 bg-surface-card border border-hairline rounded-md p-3">
            <img
              src={order.listing_image}
              alt={order.listing_title}
              className="size-10 rounded-md object-cover border border-hairline shrink-0"
            />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink truncate">{order.listing_title}</p>
              <p className="text-sm text-primary font-semibold">${order.listing_price}</p>
            </div>
          </div>

          <div className="flex justify-center gap-1 mb-4">
            {[1, 2, 3, 4, 5].map((star) => {
              const active = (ratingHover || ratingValue) >= star;
              return (
                <button
                  key={star}
                  type="button"
                  aria-label={`Rate ${star} star${star === 1 ? "" : "s"}`}
                  onMouseEnter={() => onHoverChange(star)}
                  onMouseLeave={() => onHoverChange(0)}
                  onClick={() => onValueChange(star)}
                  className={`p-0.5 rounded-md ${FOCUS_RING}`}
                >
                  <svg
                    className={`size-7 ${active ? "text-warning fill-warning" : "text-muted-soft"}`}
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    fill="none"
                  >
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                </button>
              );
            })}
          </div>

          <textarea
            value={ratingComment}
            onChange={(e) => onCommentChange(e.target.value)}
            placeholder="Leave a comment (optional)..."
            className={`w-full bg-canvas border border-border-strong rounded-md p-3 text-sm text-ink placeholder:text-muted-soft resize-none h-20 focus:outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-0`}
          />
        </div>

        <div className="border-t border-hairline px-6 py-4 flex items-center justify-end gap-2">
          <Button
            onClick={onSubmit}
            disabled={ratingValue === 0 || isSubmitting}
            size="sm"
          >
            {isSubmitting ? <Loader2 className="size-3.5 animate-spin" /> : "Submit & Confirm Pickup"}
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}
