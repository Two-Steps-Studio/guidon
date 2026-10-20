import { FinishOnboarding } from "./finish-onboarding";

export const dynamic = "force-dynamic";

/** After sign-up/sign-in: turns the /start answers into the workspace (requires a session - proxy.ts). */
export default function FinishOnboardingPage() {
  return <FinishOnboarding />;
}
