import { useRegisterSW } from 'virtual:pwa-register/react';
import { useState, useCallback } from 'react';

/**
 * PWA service-worker registration hook.
 *
 * Uses `registerType: 'prompt'` so the user sees a snackbar when
 * a new version is available and can choose to update immediately
 * without a manual browser refresh.
 */
export function usePWAUpdate() {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      // Poll for updates every 30 minutes
      if (registration) {
        setInterval(() => {
          registration.update();
        }, 30 * 60 * 1000);
      }
    },
    onRegisterError(error) {
      console.error('[PWA] SW registration error:', error);
    },
  });

  // When needRefresh becomes true, show the update prompt
  const handleUpdate = useCallback(() => {
    updateServiceWorker(true /* reloadPage */);
  }, [updateServiceWorker]);

  // Expose whether an update is needed
  return {
    updateAvailable: needRefresh,
    applyUpdate: handleUpdate,
  };
}
