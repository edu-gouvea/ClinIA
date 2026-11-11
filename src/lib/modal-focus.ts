// Portal dialogs share a stack so only the topmost dialog can receive focus or
// handle Escape. Original inert/scroll states are restored after the last closes.
const stack: HTMLElement[] = [];
const originalInert = new Map<HTMLElement, boolean>();
let originalOverflow = '';

function syncBackground() {
  for (const child of Array.from(document.body.children)) {
    if (!(child instanceof HTMLElement)) continue;
    if (stack.length) {
      if (!originalInert.has(child)) originalInert.set(child, child.inert);
      child.inert = child !== stack.at(-1);
    }
  }
  if (!stack.length) {
    for (const [element, inert] of originalInert) element.inert = inert;
    originalInert.clear();
    document.body.style.overflow = originalOverflow;
  }
}

export function activateModal(dialog: HTMLElement, onClose: () => void) {
  const overlay = dialog.parentElement!;
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  if (!stack.length) originalOverflow = document.body.style.overflow;
  stack.push(overlay);
  document.body.style.overflow = 'hidden';
  // Move focus before hiding its previous container from assistive technology.
  const focusables = () => Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]'))
    .filter(element => element.offsetParent !== null && !element.closest('[inert]'));
  (focusables()[0] ?? dialog).focus({ preventScroll: true });
  syncBackground();
  function handle(event: KeyboardEvent) {
    if (stack.at(-1) !== overlay) return;
    if (event.key === 'Escape') { event.preventDefault(); onClose(); }
    if (event.key !== 'Tab') return;
    const elements = focusables(); const first = elements[0]; const last = elements.at(-1);
    if (!first) { event.preventDefault(); dialog.focus({ preventScroll: true }); }
    else if (!dialog.contains(document.activeElement) || document.activeElement === dialog) {
      event.preventDefault(); (event.shiftKey ? last! : first).focus();
    } else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  document.addEventListener('keydown', handle);
  return () => {
    document.removeEventListener('keydown', handle);
    const index = stack.lastIndexOf(overlay);
    if (index >= 0) stack.splice(index, 1);
    syncBackground();
    if (previous?.isConnected && !previous.closest('[inert]')) previous.focus({ preventScroll: true });
    else (stack.at(-1)?.querySelector<HTMLElement>('[role="dialog"]') ?? document.getElementById('main-content'))?.focus({ preventScroll: true });
  };
}
