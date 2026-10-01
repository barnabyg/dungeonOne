// Lightweight page-script harness. Real keyboard/modal behavior is checked in Chromium.
import { runInNewContext } from "node:vm";
import { BROWSER_HTML, BROWSER_SCRIPT } from "../../dist/browser-page.js";

export async function browserPage(server, transport = fetch) {
  let ready, focused;
  const loaded = new Promise((resolve) => {
    ready = resolve;
  });
  const node = (id) => ({
    children: [],
    listeners: {},
    attributes: {},
    textContent: "",
    value: "",
    scrollTop: 0,
    clientHeight: 100,
    scrollHeight: 200,
    append(...children) {
      this.children.push(...children);
    },
    replaceChildren(...children) {
      this.children = children;
    },
    addEventListener(event, callback) {
      this.listeners[event] = callback;
    },
    setAttribute(name, value) {
      this.attributes[name] = value;
      if (id === "conversation" && name === "aria-busy" && value === "false") {
        ready();
      }
    },
    focus() {
      focused = id;
    },
    remove() {},
    showModal() {
      this.open = true;
    },
    close() {
      this.open = false;
      this.listeners.close?.();
    },
    set disabled(value) {
      this.isDisabled = value;
      if (id === "message" && !value) {
        ready();
      }
    },
    get disabled() {
      return this.isDisabled;
    },
  });
  const nodes = new Map(
    [...BROWSER_HTML.matchAll(/id="([^"]+)"/g)].map((match) => [
      match[1],
      node(match[1]),
    ]),
  );
  runInNewContext(BROWSER_SCRIPT, {
    document: {
      getElementById: (id) => nodes.get(id),
      createElement: () => node(),
    },
    fetch: (url, options = {}) =>
      transport(server.url + url, {
        ...options,
        headers: { ...options.headers, Origin: server.url },
      }),
  });
  await loaded;
  return {
    nodes,
    focused: () => focused,
    click: (id) => nodes.get(id).listeners.click(),
    submit: (message) => {
      nodes.get("message").value = message;
      return nodes.get("turn").listeners.submit({ preventDefault() {} });
    },
    texts: () => {
      const all = [];
      const walk = (item) => {
        all.push(item.textContent);
        item.children.forEach(walk);
      };
      nodes.forEach(walk);
      return all;
    },
  };
}
