import AppLayout from './AppLayout'

/**
 * Route-level page component for the map view.
 * Thin wrapper around AppLayout — exists so the router
 * has a dedicated page component to mount/unmount.
 */
export default function MapPage() {
  return <AppLayout />
}
