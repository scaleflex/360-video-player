import { addClass, createElement, removeClass } from '../utils/dom';
import { addListener } from '../utils/events';

export interface DropdownItem {
  /** Stable identifier; serialized to a `data-id` attribute. */
  id: string | number;
  /** Visible label. */
  label: string;
}

export interface DropdownOptions {
  items: DropdownItem[];
  activeId?: string | number;
  onSelect: (id: string | number) => void;
  /** Stack items vertically instead of in a horizontal pill bar. Use for menus
   *  with long labels (e.g. the stereo format picker) that would otherwise
   *  overflow / overlap. */
  vertical?: boolean;
}

export interface DropdownHandle {
  readonly element: HTMLElement;
  open(): void;
  close(): void;
  toggle(): void;
  isOpen(): boolean;
  setItems(items: DropdownItem[]): void;
  setActiveId(id: string | number): void;
  destroy(): void;
}

const OPEN_CLASS = 'ci-360-video-dropdown--open';
const ACTIVE_CLASS = 'ci-360-video-dropdown-item--active';

/**
 * Shared dropdown helper for the speed and quality selectors.
 *
 * Renders a horizontal pill bar of items above the trigger button (positioning
 * handled by CSS: `bottom: calc(100% + 20px); right: -45px;`). Clicks bubble
 * through `data-id` attributes on each item so the dropdown doesn't need to
 * keep its own click cleanups — they all live on the outer element.
 *
 * The helper does NOT install a document-level "close on outside click"
 * listener. The caller (Toolbar) does that once for all its dropdowns so they
 * close together.
 */
export function createDropdown(opts: DropdownOptions): DropdownHandle {
  const root = createElement('div', 'ci-360-video-dropdown', { role: 'listbox' });
  if (opts.vertical) addClass(root, 'ci-360-video-dropdown--vertical');

  let items = opts.items.slice();
  let activeId: string | number | undefined = opts.activeId;

  const render = (): void => {
    root.innerHTML = '';
    for (const item of items) {
      const btn = createElement('button', 'ci-360-video-dropdown-item', {
        type: 'button',
        role: 'option',
        'data-id': String(item.id),
      });
      btn.textContent = item.label;
      if (activeId !== undefined && String(activeId) === String(item.id)) {
        addClass(btn, ACTIVE_CLASS);
        btn.setAttribute('aria-selected', 'true');
      } else {
        btn.setAttribute('aria-selected', 'false');
      }
      root.appendChild(btn);
    }
  };
  render();

  // Click delegation — survives `setItems()` calls.
  const cleanupClick = addListener(root, 'click', (e: Event) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-id]');
    if (!target) return;
    e.stopPropagation();
    const raw = target.dataset.id ?? '';
    // Restore original id type (number vs string) by looking it up.
    const found = items.find((i) => String(i.id) === raw);
    if (!found) return;
    opts.onSelect(found.id);
  });

  const isOpen = (): boolean => root.classList.contains(OPEN_CLASS);

  return {
    element: root,
    open: () => addClass(root, OPEN_CLASS),
    close: () => removeClass(root, OPEN_CLASS),
    toggle: () => (isOpen() ? removeClass(root, OPEN_CLASS) : addClass(root, OPEN_CLASS)),
    isOpen,
    setItems(next) {
      items = next.slice();
      render();
    },
    setActiveId(id) {
      activeId = id;
      render();
    },
    destroy() {
      cleanupClick();
      root.remove();
    },
  };
}
