import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';

/** Renders modals on document.body so `fixed` is never trapped by overflow/transform ancestors. */
export function ModalPortal({ children }: { children: ReactNode }) {
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}
