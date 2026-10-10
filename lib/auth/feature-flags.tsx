'use client';

import { createContext, useContext } from 'react';

interface FeatureFlags {
  canSeeDivorceSettlement: boolean;
}

const FeatureFlagsContext = createContext<FeatureFlags>({ canSeeDivorceSettlement: false });

export function FeatureFlagsProvider({ flags, children }: { flags: FeatureFlags; children: React.ReactNode }) {
  return <FeatureFlagsContext.Provider value={flags}>{children}</FeatureFlagsContext.Provider>;
}

export function useFeatureFlags() {
  return useContext(FeatureFlagsContext);
}
