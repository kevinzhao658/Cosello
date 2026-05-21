import { ModalShell } from "../../../components/ui/ModalShell";
import { Button } from "../../../components/ui/button";
import { AlertTriangle } from "lucide-react";

export interface PickupAttestationModalProps {
  open: boolean;
  onClose: () => void;
  onStillWaiting: () => void;
  onConfirm: () => void;
}

export function PickupAttestationModal({
  open, onClose, onStillWaiting, onConfirm,
}: PickupAttestationModalProps) {
  if (!open) return null;
  return (
    <ModalShell open onClose={onClose} z={50}>
      <div className="relative border border-white/15 rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl" style={{ backgroundColor: "#18181b" }}>
        <div className="text-center mb-5">
          <div className="size-12 rounded-full bg-amber-500/15 flex items-center justify-center mx-auto mb-3">
            <AlertTriangle className="size-6 text-amber-400" />
          </div>
          <h3 className="text-sm font-medium">Confirm Pickup & Payment</h3>
          <p className="text-xs text-white/50 mt-2 leading-relaxed">
            By selecting Confirm, I verify that the item has been picked up and payment has been exchanged.
            Do not confirm until you have received your item and completed payment.
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            onClick={onStillWaiting}
            variant="outline"
            className="flex-1 border-white/20 text-white/60 hover:text-white hover:bg-white/5 text-xs"
            size="sm"
          >
            Still Waiting
          </Button>
          <Button
            onClick={onConfirm}
            className="flex-1 bg-green-500/20 hover:bg-green-500/30 border border-green-400/20 text-green-400 text-xs"
            size="sm"
          >
            Confirm
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}
