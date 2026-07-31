/* eslint-disable @typescript-eslint/class-literal-property-style, @typescript-eslint/no-empty-function, @typescript-eslint/no-this-alias, @typescript-eslint/prefer-regexp-exec -- minimal DOM fakes intentionally expose constants, no-op browser APIs, and tree cursors */
type Listener = (event: TestEvent) => void;

export class TestEvent {
  readonly type: string;
  readonly bubbles: boolean;
  target: TestNode | null = null;
  currentTarget: TestNode | null = null;
  defaultPrevented = false;
  propagationStopped = false;
  button = 0;
  buttons = 0;
  key = "";

  constructor(type: string, init: Partial<TestEvent> = {}) {
    this.type = type;
    this.bubbles = init.bubbles ?? true;
    Object.assign(this, init);
  }

  preventDefault(): void {
    this.defaultPrevented = true;
  }

  stopPropagation(): void {
    this.propagationStopped = true;
  }
}

export class TestNode {
  readonly nodeType: number;
  readonly nodeName: string;
  ownerDocument: TestDocument;
  parentNode: TestNode | null = null;
  childNodes: TestNode[] = [];
  private _listeners = new Map<string, Set<Listener>>();

  constructor(nodeType: number, nodeName: string, ownerDocument: TestDocument) {
    this.nodeType = nodeType;
    this.nodeName = nodeName;
    this.ownerDocument = ownerDocument;
  }

  get firstChild(): TestNode | null {
    return this.childNodes[0] ?? null;
  }

  get lastChild(): TestNode | null {
    return this.childNodes.at(-1) ?? null;
  }

  get nextSibling(): TestNode | null {
    if (!this.parentNode) return null;
    const index = this.parentNode.childNodes.indexOf(this);
    return this.parentNode.childNodes[index + 1] ?? null;
  }

  get parentElement(): TestElement | null {
    return this.parentNode instanceof TestElement ? this.parentNode : null;
  }

  appendChild<T extends TestNode>(child: T): T {
    child.parentNode?.removeChild(child);
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }

  insertBefore<T extends TestNode>(child: T, before: TestNode | null): T {
    if (!before) return this.appendChild(child);
    child.parentNode?.removeChild(child);
    const index = this.childNodes.indexOf(before);
    if (index < 0) throw new Error("insertBefore target is not a child");
    child.parentNode = this;
    this.childNodes.splice(index, 0, child);
    return child;
  }

  removeChild<T extends TestNode>(child: T): T {
    const index = this.childNodes.indexOf(child);
    if (index < 0) throw new Error("removeChild target is not a child");
    this.childNodes.splice(index, 1);
    child.parentNode = null;
    return child;
  }

  addEventListener(type: string, listener: Listener): void {
    const listeners = this._listeners.get(type) ?? new Set<Listener>();
    listeners.add(listener);
    this._listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: Listener): void {
    this._listeners.get(type)?.delete(listener);
  }

  dispatchEvent(event: TestEvent): boolean {
    if (!event.target) {
      try {
        event.target = this;
      } catch {
        // Native CustomEvent exposes a readonly target in Bun. Radix uses it
        // only as a notification, so leaving it null is sufficient here.
      }
    }
    let current: TestNode | null = this;
    do {
      try {
        event.currentTarget = current;
      } catch {
        // See the readonly native-event note above.
      }
      for (const listener of current._listeners.get(event.type) ?? []) {
        listener(event);
      }
      if (!event.bubbles || event.propagationStopped) break;
      current = current.parentNode;
    } while (current);
    try {
      event.currentTarget = null;
    } catch {
      // See the readonly native-event note above.
    }
    return !event.defaultPrevented;
  }

  remove(): void {
    this.parentNode?.removeChild(this);
  }

  get textContent(): string {
    return this.childNodes.map((child) => child.textContent).join("");
  }

  set textContent(value: string) {
    this.childNodes = [];
    if (value) this.appendChild(this.ownerDocument.createTextNode(value));
  }
}

class TestTextNode extends TestNode {
  nodeValue: string;

  constructor(value: string, ownerDocument: TestDocument) {
    super(3, "#text", ownerDocument);
    this.nodeValue = value;
  }

  override get textContent(): string {
    return this.nodeValue;
  }

  override set textContent(value: string) {
    this.nodeValue = value;
  }
}

export class TestElement extends TestNode {
  readonly tagName: string;
  readonly namespaceURI: string;
  readonly style: Record<string, unknown> = {
    setProperty(name: string, value: string) {
      this[name] = value;
    },
    removeProperty(name: string) {
      delete this[name];
    },
  };
  private _attributes = new Map<string, string>();
  private _value = "";

  get children(): TestElement[] {
    return this.childNodes.filter(
      (child): child is TestElement => child instanceof TestElement
    );
  }

  get firstElementChild(): TestElement | null {
    return this.children[0] ?? null;
  }

  get lastElementChild(): TestElement | null {
    return this.children.at(-1) ?? null;
  }

  get clientWidth(): number {
    return 1024;
  }

  get clientHeight(): number {
    return 768;
  }

  get length(): number {
    return this.children.length;
  }

  get options(): TestElement[] {
    return this.children;
  }

  get value(): string {
    return this._value;
  }

  set value(next: string) {
    this._value = String(next);
  }

  constructor(
    tagName: string,
    ownerDocument: TestDocument,
    namespace?: string
  ) {
    const normalized = tagName.toUpperCase();
    super(1, normalized, ownerDocument);
    this.tagName = normalized;
    this.namespaceURI = namespace ?? "http://www.w3.org/1999/xhtml";
  }

  private _syncIndexedChildren(): void {
    const indexed = this as unknown as Record<number, TestElement | undefined>;
    let index = 0;
    while (indexed[index] !== undefined) {
      delete indexed[index];
      index += 1;
    }
    this.children.forEach((child, childIndex) => {
      indexed[childIndex] = child;
    });
  }

  override appendChild<T extends TestNode>(child: T): T {
    const appended = super.appendChild(child);
    this._syncIndexedChildren();
    return appended;
  }

  override insertBefore<T extends TestNode>(
    child: T,
    before: TestNode | null
  ): T {
    const inserted = super.insertBefore(child, before);
    this._syncIndexedChildren();
    return inserted;
  }

  override removeChild<T extends TestNode>(child: T): T {
    const removed = super.removeChild(child);
    this._syncIndexedChildren();
    return removed;
  }

  setAttribute(name: string, value: unknown): void {
    this._attributes.set(name, String(value));
  }

  getAttribute(name: string): string | null {
    return this._attributes.get(name) ?? null;
  }

  removeAttribute(name: string): void {
    this._attributes.delete(name);
  }

  hasAttribute(name: string): boolean {
    return this._attributes.has(name);
  }

  get className(): string {
    return this.getAttribute("class") ?? "";
  }

  set className(value: string) {
    this.setAttribute("class", value);
  }

  get classList() {
    const read = () => new Set(this.className.split(/\s+/).filter(Boolean));
    return {
      contains: (name: string) => read().has(name),
      add: (...names: string[]) => {
        const classes = read();
        names.forEach((name) => classes.add(name));
        this.className = [...classes].join(" ");
      },
      remove: (...names: string[]) => {
        const classes = read();
        names.forEach((name) => classes.delete(name));
        this.className = [...classes].join(" ");
      },
      toggle: (name: string, force?: boolean) => {
        const classes = read();
        const next = force ?? !classes.has(name);
        if (next) classes.add(name);
        else classes.delete(name);
        this.className = [...classes].join(" ");
        return next;
      },
    };
  }

  contains(node: TestNode | null): boolean {
    let current = node;
    while (current) {
      if (current === this) return true;
      current = current.parentNode;
    }
    return false;
  }

  querySelector(selector: string): TestElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector: string): TestElement[] {
    const results = [] as unknown as TestElement[] & {
      item(index: number): TestElement | null;
    };
    results.item = (index: number) => results[index] ?? null;
    const visit = (node: TestNode) => {
      for (const child of node.childNodes) {
        if (child instanceof TestElement) {
          if (_matches(child, selector)) results.push(child);
          visit(child);
        }
      }
    };
    visit(this);
    return results;
  }

  closest(selector: string): TestElement | null {
    let current: TestNode | null = this;
    while (current instanceof TestElement) {
      if (_matches(current, selector)) return current;
      current = current.parentNode;
    }
    return null;
  }

  matches(selector: string): boolean {
    return selector.split(",").some((part) => _matches(this, part.trim()));
  }

  focus(): void {
    this.ownerDocument.activeElement = this;
  }

  blur(): void {
    if (this.ownerDocument.activeElement === this) {
      this.ownerDocument.activeElement = this.ownerDocument.body;
    }
  }

  getBoundingClientRect(): DOMRect {
    return {
      x: 0,
      y: 0,
      top: 0,
      right: this.clientWidth,
      bottom: this.clientHeight,
      left: 0,
      width: this.clientWidth,
      height: this.clientHeight,
      toJSON: () => ({}),
    };
  }

  insertAdjacentElement(position: string, element: TestElement): TestElement {
    if (position === "afterbegin") {
      this.insertBefore(element, this.firstChild);
    } else {
      this.appendChild(element);
    }
    return element;
  }

  click(): void {
    this.dispatchEvent(new TestEvent("click"));
  }

  select(): void {}
}

function _matches(element: TestElement, selector: string): boolean {
  const attributeStart = selector.indexOf("[");
  if (attributeStart > 0 && selector.endsWith("]")) {
    return (
      _matches(element, selector.slice(0, attributeStart)) &&
      _matches(element, selector.slice(attributeStart))
    );
  }
  const attribute = selector.match(/^\[([^=\]]+)(?:=["']?([^"'\]]+)["']?)?\]$/);
  if (attribute) {
    const [, name, expected] = attribute;
    const value = element.getAttribute(name);
    return expected === undefined ? value !== null : value === expected;
  }
  if (selector.startsWith(".")) {
    return element.classList.contains(selector.slice(1));
  }
  return element.tagName.toLowerCase() === selector.toLowerCase();
}

export class TestDocument extends TestNode {
  readonly compatMode = "CSS1Compat";
  readonly doctype = { name: "html", publicId: "", systemId: "" };
  readonly documentElement: TestElement;
  readonly head: TestElement;
  readonly body: TestElement;
  activeElement: TestElement;
  defaultView: Record<string, unknown>;

  constructor() {
    // The document is its own owner; assign after super returns.
    super(9, "#document", undefined as unknown as TestDocument);
    this.ownerDocument = this;
    this.documentElement = this.createElement("html");
    this.head = this.createElement("head");
    this.body = this.createElement("body");
    this.documentElement.appendChild(this.head);
    this.documentElement.appendChild(this.body);
    this.appendChild(this.documentElement);
    this.activeElement = this.body;
    this.defaultView = {};
  }

  createElement(tagName: string): TestElement {
    return new TestElement(tagName, this);
  }

  createElementNS(namespace: string, tagName: string): TestElement {
    return new TestElement(tagName, this, namespace);
  }

  createTextNode(value: string): TestNode {
    return new TestTextNode(value, this);
  }

  createComment(value: string): TestNode {
    return new TestTextNode(value, this);
  }

  querySelector(selector: string): TestElement | null {
    if (_matches(this.documentElement, selector)) return this.documentElement;
    return this.documentElement.querySelector(selector);
  }

  querySelectorAll(selector: string): TestElement[] {
    const descendants = this.documentElement.querySelectorAll(selector);
    const results = (
      _matches(this.documentElement, selector)
        ? [this.documentElement, ...descendants]
        : descendants
    ) as TestElement[] & {
      item(index: number): TestElement | null;
    };
    results.item = (index: number) => results[index] ?? null;
    return results;
  }

  getElementsByTagName(tagName: string): TestElement[] {
    const normalized = tagName.toLowerCase();
    const elements = [
      this.documentElement,
      ...this.documentElement.querySelectorAll(normalized),
    ];
    return elements.filter(
      (element) => element.tagName.toLowerCase() === normalized
    );
  }
}

export function installReactTestDom(): {
  document: TestDocument;
  restore: () => void;
} {
  const document = new TestDocument();
  class TestHTMLElement extends TestElement {}
  class TestHTMLIFrameElement extends TestHTMLElement {}
  class TestDOMRect {
    x: number;
    y: number;
    width: number;
    height: number;
    top: number;
    right: number;
    bottom: number;
    left: number;

    constructor(x = 0, y = 0, width = 0, height = 0) {
      this.x = x;
      this.y = y;
      this.width = width;
      this.height = height;
      this.top = y;
      this.right = x + width;
      this.bottom = y + height;
      this.left = x;
    }

    static fromRect(rect: Partial<TestDOMRect> = {}): TestDOMRect {
      return new TestDOMRect(
        rect.x ?? 0,
        rect.y ?? 0,
        rect.width ?? 0,
        rect.height ?? 0
      );
    }

    toJSON(): Record<string, number> {
      return {
        x: this.x,
        y: this.y,
        width: this.width,
        height: this.height,
      };
    }
  }
  class TestResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  class TestMutationObserver {
    observe(): void {}
    disconnect(): void {}
    takeRecords(): unknown[] {
      return [];
    }
  }
  const storage = new Map<string, string>();
  const localStorage = {
    get length() {
      return storage.size;
    },
    clear: () => storage.clear(),
    getItem: (key: string) => storage.get(key) ?? null,
    key: (index: number) => [...storage.keys()][index] ?? null,
    removeItem: (key: string) => storage.delete(key),
    setItem: (key: string, value: string) => storage.set(key, String(value)),
  };
  const windowListeners = new Map<string, Set<Listener>>();
  const defaultView = {
    document,
    Node: TestNode,
    Element: TestElement,
    HTMLElement: TestElement,
    HTMLInputElement: TestElement,
    HTMLTextAreaElement: TestElement,
    HTMLSelectElement: TestElement,
    HTMLIFrameElement: TestHTMLIFrameElement,
    SVGElement: TestElement,
    DOMRect: TestDOMRect,
    Event: TestEvent,
    getComputedStyle: () => ({}),
    addEventListener: (type: string, listener: Listener) => {
      const listeners = windowListeners.get(type) ?? new Set<Listener>();
      listeners.add(listener);
      windowListeners.set(type, listeners);
    },
    removeEventListener: (type: string, listener: Listener) => {
      windowListeners.get(type)?.delete(listener);
    },
    requestAnimationFrame: (callback: (time: number) => void) => {
      callback(0);
      return 1;
    },
    cancelAnimationFrame: () => undefined,
    setTimeout,
    clearTimeout,
    ResizeObserver: TestResizeObserver,
    MutationObserver: TestMutationObserver,
    innerHeight: 900,
    innerWidth: 1440,
    localStorage,
    matchMedia: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => true,
    }),
  };
  document.defaultView = defaultView;
  const globals = globalThis as Record<string, unknown>;
  const previous = new Map<string, unknown>();
  for (const [key, value] of Object.entries({
    window: defaultView,
    document,
    Node: TestNode,
    Element: TestElement,
    HTMLElement: TestElement,
    HTMLInputElement: TestElement,
    HTMLTextAreaElement: TestElement,
    HTMLSelectElement: TestElement,
    HTMLIFrameElement: TestHTMLIFrameElement,
    SVGElement: TestElement,
    DOMRect: TestDOMRect,
    Event: TestEvent,
    getComputedStyle: () => ({}),
    requestAnimationFrame: defaultView.requestAnimationFrame,
    cancelAnimationFrame: defaultView.cancelAnimationFrame,
    matchMedia: defaultView.matchMedia,
    customElements: {
      get: () => undefined,
      define: () => undefined,
    },
    ResizeObserver: TestResizeObserver,
    MutationObserver: TestMutationObserver,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    previous.set(key, globals[key]);
    globals[key] = value;
  }
  return {
    document,
    restore: () => {
      for (const [key, value] of previous) {
        if (value === undefined) delete globals[key];
        else globals[key] = value;
      }
    },
  };
}
