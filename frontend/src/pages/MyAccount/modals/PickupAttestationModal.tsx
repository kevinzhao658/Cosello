import { ModalShell } from "../../../components/ui/ModalShell";
import { Button } from "../../../components/ui/button";
import { AlertTriangle } from "lucide-react";
import { MODAL_TITLE } from "../constants";

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
      <div className="relative bg-canvas border border-hairline rounded-md max-w-sm w-full mx-4 shadow-overlay">
        <div className="px-6 pt-6 pb-4 text-center">
          <div className="size-12 rounded-full bg-primary-soft flex items-center justify-center mx-auto mb-3">
            <AlertTriangle className="size-6 text-warning" />
          </div>
          <h3 className={`text-xl ${MODAL_TITLE}`}>Confirm Pickup & Payment</h3>
          <p className="text-sm text-muted mt-2 leading-relaxed">
            By selecting Confirm, I verify that the item has been picked up and payment has been exchanged.
            Do not confirm until you have received your item and completed payment.
          </p>
        </div>
        <div className="border-t border-hairline px-6 py-4 flex items-center justify-end gap-2">
          <Button
            onClick={onStillWaiting}
            variant="outline"
            size="sm"
          >
            Still Waiting
          </Button>
          <Button
            onClick={onConfirm}
            size="sm"
          >
            Confirm
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}
