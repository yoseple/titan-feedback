import { useState, useEffect } from 'react';

// Captures the browser's beforeinstallprompt so we can offer a real "Install" button
// (Chrome/Android). iOS has no such event — an A2HS hint would be a separate follow-up.
export function useInstallPrompt() {
  const [deferred, setDeferred] = useState(null);
  useEffect(() => {
    const onPrompt = (e) => { e.preventDefault(); setDeferred(e); };
    const onInstalled = () => setDeferred(null);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);
  const promptInstall = async () => {
    if (!deferred) return;
    deferred.prompt();
    try { await deferred.userChoice; } catch { /* dismissed */ }
    setDeferred(null);
  };
  return { canInstall: !!deferred, promptInstall };
}
