// frontend/src/pages/SignUpPage.tsx
import type { AuthUser } from "../contexts/AuthContext";
import { SignUpWizard } from "./signup/SignUpWizard";

interface SignUpPageProps {
  pendingToken: string;
  onComplete: (user: AuthUser) => void;
  onCancel: () => void;
  onStartSelling: () => void;
  onBrowse: () => void;
}

export default function SignUpPage(props: SignUpPageProps) {
  return <SignUpWizard {...props} />;
}
