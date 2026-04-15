import { useState, useEffect } from 'react';

export interface AppSettings {
  showUtxoList: boolean;
}

const DEFAULTS: AppSettings = {
  showUtxoList: false,
};

const KEY = 'punkpay_settings';

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setSettings({ ...DEFAULTS, ...JSON.parse(raw) });
    } catch {}
    setLoaded(true);
  }, []);

  function update(patch: Partial<AppSettings>) {
    setSettings(prev => {
      const next = { ...prev, ...patch };
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }

  return { settings, update, loaded };
}
