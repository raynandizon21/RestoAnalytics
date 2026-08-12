type TelegramWebApp = {
  ready?: () => void;
  expand?: () => void;
  requestFullscreen?: () => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  isExpanded?: boolean;
  isFullscreen?: boolean;
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

/** Expand / fullscreen Telegram Mini App as soon as possible. */
export function bootstrapTelegramWebApp(): void {
  try {
    const tg = window.Telegram?.WebApp;
    if (!tg) return;

    tg.ready?.();
    tg.expand?.();

    try {
      tg.setHeaderColor?.('#020617');
      tg.setBackgroundColor?.('#020617');
    } catch {
      /* ignore older clients */
    }

    try {
      tg.requestFullscreen?.();
    } catch {
      /* ignore if unsupported / denied */
    }
  } catch {
    /* not inside Telegram */
  }
}
