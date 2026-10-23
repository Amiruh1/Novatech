const CONTROLS = 'button, a[href], input:not([type="hidden"]), select, textarea, summary, [tabindex]';
const NATIVE_ARROWS = 'textarea, select, input:not([type="checkbox"]):not([type="button"]):not([type="submit"]), '
  + '[contenteditable]:not([contenteditable="false"]), [role="combobox"], [role="listbox"], '
  + '[role="slider"], [role="spinbutton"], [role="radiogroup"], [role="tablist"], '
  + '[role="menu"], [role="menubar"], [role="tree"], [role="grid"]';

export function moveFocusWithArrow(event: KeyboardEvent, container: HTMLElement, wrap = false): boolean {
  const direction = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1
    : event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 0;
  if (!direction || event.defaultPrevented || event.isComposing
    || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false;

  const document = container.ownerDocument;
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !container.contains(active)
    || active.closest(NATIVE_ARROWS)) return false;

  const scope = active.closest<HTMLElement>('dialog[open], [role="dialog"], [role="alertdialog"], .p-drawer') || container;
  const viewport = document.defaultView;
  const controls = [...scope.querySelectorAll<HTMLElement>(CONTROLS)].filter(element => {
    if (element.tabIndex < 0 || element.matches(':disabled, [aria-disabled="true"]')
      || element.closest('[inert], [hidden], [aria-hidden="true"]')) return false;
    const rect = element.getBoundingClientRect();
    const visibility = viewport?.getComputedStyle(element).visibility;
    return rect.width > 0 && rect.height > 0 && visibility !== 'hidden' && visibility !== 'collapse';
  });
  if (!controls.length) return false;

  const index = controls.indexOf(active);
  let next = index + direction;
  if (index < 0) {
    next = -1;
    if (direction > 0) {
      next = controls.findIndex(element => !!(active.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING));
    } else {
      for (let i = controls.length - 1; i >= 0; i--) {
        if (active.compareDocumentPosition(controls[i]) & Node.DOCUMENT_POSITION_PRECEDING) { next = i; break; }
      }
    }
    if (next < 0 && direction > 0) next = controls.length;
  }
  if (wrap) next = (next + controls.length) % controls.length;
  if (next < 0 || next >= controls.length) return false;

  event.preventDefault();
  event.stopPropagation();
  controls[next].focus();
  return true;
}
