/**
 * CommunitiesContext — provides the user's public/private communities and a
 * refetch handler app-wide so SellWizard, MarketplaceSidebar, and MyAccountPage
 * do not need these drilled as props from App.tsx.
 *
 * App.tsx owns the state and the fetch (unchanged). It wraps the tree in
 * CommunitiesProvider; consumers call `useCommunities()`.
 */
import { createContext, useContext, type ReactNode } from "react";

export interface CommunitySummaryEntry {
  id: number;
  name: string;
  neighborhood?: string;
  is_public?: boolean;
}

export interface CommunitiesValue {
  publicCommunities: CommunitySummaryEntry[];
  privateCommunities: CommunitySummaryEntry[];
  fetchFilterCommunities: () => void;
}

const CommunitiesContext = createContext<CommunitiesValue>({
  publicCommunities: [],
  privateCommunities: [],
  fetchFilterCommunities: () => {},
});

export function CommunitiesProvider({
  value,
  children,
}: {
  value: CommunitiesValue;
  children: ReactNode;
}) {
  return (
    <CommunitiesContext.Provider value={value}>
      {children}
    </CommunitiesContext.Provider>
  );
}

export function useCommunities(): CommunitiesValue {
  return useContext(CommunitiesContext);
}
