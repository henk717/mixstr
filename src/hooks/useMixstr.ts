import { useContext } from 'react';
import { MixstrContext } from '@/contexts/MixstrContext';

export function useMixstr() {
  const ctx = useContext(MixstrContext);
  if (!ctx) throw new Error('useMixstr must be used within MixstrProvider');
  return ctx;
}
