type TelegramSafeArea = {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
};

type TelegramWebApp = {
  version?: string;
  initData?: string;
  initDataUnsafe?: Record<string, unknown>;
  platform?: string;
  ready?: () => void;
  expand?: () => void;
  requestFullscreen?: () => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  isVersionAtLeast?: (version: string) => boolean;
  isExpanded?: boolean;
  isFullscreen?: boolean;
  safeAreaInset?: TelegramSafeArea;
  contentSafeAreaInset?: TelegramSafeArea;
  onEvent?: (eventType: string, callback: () => void) => void;
  offEvent?: (eventType: string, callback: () => void) => void;
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

function supports(tg: TelegramWebApp, minVersion: string): boolean {
  try {
    if (typeof tg.isVersionAtLeast === 'function') {
      return tg.isVersionAtLeast(minVersion);
    }
  } catch {
    return false;
  }
  return false;
}

function applySafeAreaCssVars(tg: TelegramWebApp): void {
  try {
    const root = document.documentElement;
    const safe = tg.safeAreaInset || {};
    const content = tg.contentSafeAreaInset || {};
    const set = (name: string, value: number | undefined, fallbackPx: number) => {
      const px = Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : fallbackPx;
      root.style.setProperty(name, `${px}px`);
    };
    // Telegram Close / menu sit in content safe area top — use a solid minimum on mobile.
    set('--tg-safe-area-inset-top', safe.top, 0);
    set('--tg-safe-area-inset-bottom', safe.bottom, 0);
    set('--tg-content-safe-area-inset-top', content.top, 52);
    set('--tg-content-safe-area-inset-bottom', content.bottom, 0);
  } catch {
    /* ignore */
  }
}

/** True when running inside Telegram Mini App WebView. */
export function isTelegramWebApp(): boolean {
  try {
    const tg = window.Telegram?.WebApp;
    if (!tg) return false;
    if (String(tg.initData || '').trim()) return true;
    const platform = String(tg.platform || '').toLowerCase();
    return Boolean(platform && platform !== 'unknown');
  } catch {
    return false;
  }
}

export function getTelegramInitData(): string {
  try {
    return String(window.Telegram?.WebApp?.initData || '').trim();
  } catch {
    return '';
  }
}

/** Expand / fullscreen Telegram Mini App as soon as possible. */
export function bootstrapTelegramWebApp(): void {
  try {
    const tg = window.Telegram?.WebApp;
    if (!tg) return;

    tg.ready?.();
    tg.expand?.();
    applySafeAreaCssVars(tg);

    if (supports(tg, '6.1')) {
      try {
        tg.setHeaderColor?.('#0f172a');
        tg.setBackgroundColor?.('#0f172a');
      } catch {
        /* ignore */
      }
    }

    if (supports(tg, '8.0') && typeof tg.requestFullscreen === 'function') {
      try {
        tg.requestFullscreen();
      } catch {
        /* ignore if unsupported / denied */
      }
    }

    const syncSafeArea = () => applySafeAreaCssVars(tg);
    try {
      tg.onEvent?.('safeAreaChanged', syncSafeArea);
      tg.onEvent?.('contentSafeAreaChanged', syncSafeArea);
      tg.onEvent?.('fullscreenChanged', syncSafeArea);
    } catch {
      /* ignore */
    }
  } catch {
    /* not inside Telegram */
  }
}
