import type { TFunction } from "i18next";
import { resources, DEFAULT_NAMESPACE } from "./resources";

// User-visible text built outside React (lib/, constants/, the bridge store)
// cannot call t(): it carries an i18next key ("namespace:path") and its
// values instead, and the component translates it when it renders, so the
// text follows the language switch. A value can itself be a message,
// translated first ("{{text}}: {{cause}}" around another message).

export type MsgValue = string | number | Msg;

export interface Msg {
  key: string;
  params?: Record<string, MsgValue>;
}

export function msg(key: string, params?: Record<string, MsgValue>): Msg {
  return params ? { key, params } : { key };
}

export function isMsg(value: unknown): value is Msg {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Msg).key === "string"
  );
}

/** The message in the current language. */
export function translate(t: TFunction, message: Msg): string {
  if (!message.params) return t(message.key);
  const values: Record<string, string | number> = {};
  for (const [name, value] of Object.entries(message.params)) {
    values[name] = isMsg(value) ? translate(t, value) : value;
  }
  return t(message.key, values);
}

const englishPlurals = new Intl.PluralRules("en");

function lookup(path: string[]): unknown {
  let node: unknown = resources.en;
  for (const part of path) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

/**
 * The message in English without an i18next instance, for code that needs
 * the text itself outside React (comparisons, logs). Plain `{{name}}`
 * interpolation and `_one`/`_other` plurals, as the locale files use.
 */
export function englishText(message: Msg): string {
  const [ns, key] = message.key.includes(":")
    ? message.key.split(":", 2)
    : [DEFAULT_NAMESPACE, message.key];
  const path = [ns, ...key.split(".")];
  const count = message.params?.count;
  let template: unknown;
  if (typeof count === "number") {
    const last = path.length - 1;
    const suffix = englishPlurals.select(count);
    template =
      lookup([...path.slice(0, last), `${path[last]}_${suffix}`]) ??
      lookup([...path.slice(0, last), `${path[last]}_other`]);
  }
  if (typeof template !== "string") template = lookup(path);
  if (typeof template !== "string") return message.key;
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (all, name: string) => {
    const value = message.params?.[name];
    if (value === undefined) return all;
    return isMsg(value) ? englishText(value) : String(value);
  });
}
