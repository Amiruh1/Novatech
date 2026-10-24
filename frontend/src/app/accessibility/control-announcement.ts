const ROLE_WORDS: Record<string, string> = {
  button: 'botón',
  link: 'enlace',
  textbox: 'campo de texto',
  searchbox: 'campo de texto',
  password: 'campo protegido',
  checkbox: 'casilla',
  switch: 'interruptor',
  radio: 'opción',
  option: 'opción',
  combobox: 'selector',
  listbox: 'lista',
  slider: 'control deslizante',
  spinbutton: 'campo numérico',
  tab: 'pestaña',
  menuitem: 'opción de menú'
};

const FIELD_ROLES = new Set(['textbox', 'searchbox', 'password', 'combobox', 'listbox', 'slider', 'spinbutton', 'checkbox', 'switch', 'radio']);
const FORM_CONTROLS = 'input, select, textarea, [contenteditable]:not([contenteditable="false"])';
const SKIPPED = `${FORM_CONTROLS}, button, svg, script, style, template, [aria-hidden="true"], [hidden], .pi`;
const PUBLIC_OPTIONS = 'publicas';
const MAX_NAME = 160;

export function describeControl(element: HTMLElement): string | null {
  if (/^H[1-6]$/.test(element.tagName)) {
    return element.hasAttribute('data-narrator-heading') ? limit(textOf(element)) || null : null;
  }
  const role = roleOf(element);
  if (!role) return null;
  if (role === 'combobox') {
    const option = activeOption(element);
    if (option) return option;
  }
  const explicit = explicitLabel(element);
  const name = explicit || nameOf(element, role);
  if (!name || (!explicit && looksPersonal(name))) return null;
  return compose(name, role, element);
}

function roleOf(element: HTMLElement): string | null {
  const tag = element.tagName;
  const explicit = (element.getAttribute('role') || '').trim().split(/\s+/)[0];
  if (tag === 'INPUT') {
    const input = element as HTMLInputElement;
    const type = input.type;
    if (type === 'hidden') return null;
    if (type === 'checkbox') return explicit === 'switch' ? 'switch' : 'checkbox';
    if (type === 'radio') return 'radio';
    if (type === 'range') return 'slider';
    if (['button', 'submit', 'reset', 'image'].includes(type)) return 'button';
    if (type === 'password' || /password/i.test(input.autocomplete)) return 'password';
    if (type === 'number') return 'spinbutton';
    return 'textbox';
  }
  if (explicit) return explicit in ROLE_WORDS ? explicit : null;
  if (tag === 'BUTTON' || tag === 'SUMMARY') return 'button';
  if (tag === 'A') return element.hasAttribute('href') ? 'link' : null;
  if (tag === 'TEXTAREA') return 'textbox';
  if (tag === 'SELECT') return 'combobox';
  if (tag === 'IFRAME') return element.parentElement?.closest('[data-narrator-label]') ? 'button' : null;
  return element.isContentEditable ? 'textbox' : null;
}

function explicitLabel(element: HTMLElement): string {
  const own = element.getAttribute('data-narrator-label');
  if (own !== null) return limit(clean(own));
  if (element.tagName === 'IFRAME' || element.matches('p-select [role="combobox"]')) {
    return limit(clean(element.parentElement?.closest('[data-narrator-label]')?.getAttribute('data-narrator-label')));
  }
  return '';
}

function nameOf(element: HTMLElement, role: string): string {
  const labelled = textFromIds(element, 'aria-labelledby');
  if (labelled) return labelled;
  const insideSelect = !!element.closest('p-select');
  const aria = insideSelect ? '' : limit(clean(element.getAttribute('aria-label')));
  if (aria) return aria;
  if (FIELD_ROLES.has(role)) {
    return labelFor(element) || limit(clean(element.getAttribute('placeholder'))) || limit(clean(element.getAttribute('title')));
  }
  return limit(textOf(element)) || limit(clean(element.getAttribute('title'))) || imageText(element);
}

function compose(name: string, role: string, element: HTMLElement): string {
  const word = ROLE_WORDS[role];
  const checked = checkedState(element, role);
  const parts = [name, checked ? `${word} ${checked}` : word];
  if (role === 'combobox') {
    const value = selectedValue(element);
    if (value) parts.push(value);
  }
  return [...parts, ...otherStates(element, role)].join(', ');
}

function checkedState(element: HTMLElement, role: string): string {
  const input = element instanceof HTMLInputElement ? element : null;
  const value = input ? (input.indeterminate ? 'mixed' : String(input.checked)) : element.getAttribute('aria-checked');
  if (role === 'checkbox') return value === 'true' ? 'marcada' : value === 'mixed' ? 'en estado mixto' : 'no marcada';
  if (role === 'switch') return value === 'true' ? 'activado' : 'no activado';
  if (role === 'radio') return value === 'true' ? 'seleccionada' : 'no seleccionada';
  if (role === 'option' || role === 'tab') return element.getAttribute('aria-selected') === 'true' ? 'seleccionada' : '';
  return '';
}

function otherStates(element: HTMLElement, role: string): string[] {
  const states: string[] = [];
  const pressed = element.getAttribute('aria-pressed');
  if (role === 'button' && pressed !== null) {
    states.push(pressed === 'true' ? 'activado' : pressed === 'mixed' ? 'estado mixto' : 'no activado');
  }
  const expanded = element.getAttribute('aria-expanded');
  if (expanded === 'true') states.push('expandido');
  if (expanded === 'false') states.push('contraído');
  if (element.getAttribute('aria-current') === 'page') states.push('página actual');
  if ((element as HTMLButtonElement).disabled || element.getAttribute('aria-disabled') === 'true') states.push('no disponible');
  return states;
}

function selectedValue(element: HTMLElement): string {
  const host = element.closest('p-select');
  if (!host || host.getAttribute('data-narrator-options') !== PUBLIC_OPTIONS) return '';
  return limit(textOf(element));
}

function activeOption(element: HTMLElement): string | null {
  const host = element.closest('p-select');
  if (!host || host.getAttribute('data-narrator-options') !== PUBLIC_OPTIONS) return null;
  if (element.getAttribute('aria-expanded') !== 'true') return null;
  const listId = element.getAttribute('aria-controls');
  const optionId = element.getAttribute('aria-activedescendant');
  if (!listId || !optionId) return null;
  const document = element.ownerDocument;
  const list = document.getElementById(listId);
  const option = document.getElementById(optionId);
  if (!list || !option || !list.contains(option) || option.getAttribute('role') !== 'option') return null;
  const label = limit(clean(option.getAttribute('aria-label'))) || limit(textOf(option));
  if (!label) return null;
  return option.getAttribute('aria-selected') === 'true' ? `${label}, opción seleccionada` : `${label}, opción`;
}

function textFromIds(element: HTMLElement, attribute: string): string {
  const document = element.ownerDocument;
  const parts = (element.getAttribute(attribute) || '').split(/\s+/).filter(Boolean)
    .map(id => document.getElementById(id))
    .filter((node): node is HTMLElement => !!node && !node.matches(FORM_CONTROLS))
    .map(node => textOf(node));
  return limit(clean(parts.join(' ')));
}

function labelFor(element: HTMLElement): string {
  const id = element.id;
  const label = (id && element.ownerDocument.querySelector<HTMLElement>(`label[for="${CSS.escape(id)}"]`))
    || element.closest<HTMLElement>('label');
  return label ? limit(textOf(label)) : '';
}

function imageText(element: HTMLElement): string {
  return limit(clean(element.querySelector('img[alt]')?.getAttribute('alt')));
}

function textOf(root: Element): string {
  let text = '';
  const walk = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += ` ${node.textContent || ''}`;
      return;
    }
    if (!(node instanceof Element) || (node !== root && node.matches(SKIPPED))) return;
    node.childNodes.forEach(walk);
  };
  walk(root);
  return clean(text);
}

function looksPersonal(text: string): boolean {
  return text.includes('@') || /\d{7,}/.test(text.replace(/\s+/g, ''));
}

function clean(text: string | null | undefined): string {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function limit(text: string): string {
  if (text.length <= MAX_NAME) return text;
  const cut = text.slice(0, MAX_NAME);
  const space = cut.lastIndexOf(' ');
  return `${space > 40 ? cut.slice(0, space) : cut}…`;
}
