type TelegramWebApp = {
  version?: string;
  ready?: () => void;
  expand?: () => void;
  requestFullscreen?: () => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  isVersionAtLeast?: (version: string) => boolean;
  isExpanded?: boolean;
  isFullscreen?: boolean;
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

/** Expand / fullscreen Telegram Mini App as soon as possible. */
export function bootstrapTelegramWebApp(): void {
  try {
    const tg = window.Telegram?.WebApp;
    if (!tg) return;

    tg.ready?.();
    tg.expand?.();

    // Bot API 6.1+: header / background color
    if (supports(tg, '6.1')) {
      try {
        tg.setHeaderColor?.('#020617');
        tg.setBackgroundColor?.('#020617');
      } catch {
        /* ignore */
      }
    }

    // Bot API 8.0+: true device fullscreen
    if (supports(tg, '8.0') && typeof tg.requestFullscreen === 'function') {
      try {
        tg.requestFullscreen();
      } catch {
        /* ignore if unsupported / denied */
      }
    }
  } catch {
    /* not inside Telegram */
  }
}
