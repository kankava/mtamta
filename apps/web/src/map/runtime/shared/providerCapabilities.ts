import {
  getFeatureState as coreGetFeatureState,
  isFeatureAvailable as coreIsFeatureAvailable,
} from '@mtamta/map-core'
import type { FeatureId, CapabilityState } from '@mtamta/map-core'
import { useMapStore } from '../../../stores/mapStore'

/**
 * Returns the CapabilityState for a feature given the current provider.
 * Returns 'unsupported' if no provider is selected.
 */
export function useFeatureState(feature: FeatureId): CapabilityState {
  const provider = useMapStore((s) => s.mapProvider)
  if (!provider) return 'unsupported'
  return coreGetFeatureState(provider, feature)
}

/**
 * Returns true if a feature is available for the current provider.
 */
export function useIsFeatureAvailable(feature: FeatureId): boolean {
  const provider = useMapStore((s) => s.mapProvider)
  if (!provider) return false
  return coreIsFeatureAvailable(provider, feature)
}
