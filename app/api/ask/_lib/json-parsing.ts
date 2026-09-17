import "server-only";

/** Complete top-level JSON token offsets used only by the scanner. */
interface TopLevelProperty { key: string; valueStart: number }

/**
 * Extracts the longest fully decoded prefix of a selected top-level JSON string.
 *
 * @param raw - Incomplete or complete JSON received so far.
 * @param propertyName - Top-level property whose string prefix is decoded.
 * @returns The decoded string prefix when its field has started, otherwise null.
 */
export function extractPartialString(raw: string, propertyName: string): string | null {
  const property = scanTopLevelProperties(raw).find(({ key }) => key === propertyName);
  if (!property || raw[property.valueStart] !== '"') return null;
  const start = property.valueStart + 1;
  let escaped = false;
  let unicode = "";
  let decoded = "";
  for (let index = start; index < raw.length; index += 1) {
    const character = raw[index];
    if (character === undefined) break;
    if (unicode) {
      unicode += character;
      if (unicode.length < 5) continue;
      if (!/^u[0-9A-Fa-f]{4}$/u.test(unicode)) throw new SyntaxError("an invalid JSON escape");
      decoded += String.fromCharCode(Number.parseInt(unicode.slice(1), 16));
      unicode = "";
      escaped = false;
      continue;
    }
    if (escaped) {
      if (character === "u") unicode = "u";
      else {
        const escapes: Record<string, string> = { '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" };
        const value = escapes[character];
        if (value === undefined) throw new SyntaxError("an invalid JSON escape");
        decoded += value;
        escaped = false;
      }
      continue;
    }
    if (character === "\\") escaped = true;
    else if (character === '"') return safeUnicodePrefix(decoded);
    else if (character.charCodeAt(0) < 0x20) throw new SyntaxError("invalid JSON text");
    else decoded += character;
  }
  return safeUnicodePrefix(decoded);
}

/**
 * Prevents an incomplete or invalid UTF-16 surrogate from reaching TextEncoder and becoming replacement text.
 *
 * @param value - Decoded string snapshot.
 * @returns The longest prefix containing only complete Unicode scalar values.
 */
export function safeUnicodePrefix(value: string): string {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xD800 && unit <= 0xDBFF) {
      const next = value.charCodeAt(index + 1);
      if (next < 0xDC00 || next > 0xDFFF) return value.slice(0, index);
      index += 1;
    } else if (unit >= 0xDC00 && unit <= 0xDFFF) return value.slice(0, index);
  }
  return value;
}

/**
 * Scans only top-level JSON properties and stops cleanly at an incomplete value.
 *
 * @param raw - Partial or complete JSON.
 * @returns Complete top-level keys and their value offsets in source order.
 */
function scanTopLevelProperties(raw: string): TopLevelProperty[] {
  const properties: TopLevelProperty[] = [];
  let index = skipWhitespace(raw, 0);
  if (raw[index] !== "{") return properties;
  index += 1;
  for (;;) {
    index = skipWhitespace(raw, index);
    if (index >= raw.length || raw[index] === "}") return properties;
    const keyEnd = completeJsonStringEnd(raw, index);
    if (keyEnd === null) return properties;
    let key: unknown;
    try {
      key = JSON.parse(raw.slice(index, keyEnd)) as unknown;
    } catch {
      throw new SyntaxError("a malformed object key");
    }
    if (typeof key !== "string") throw new SyntaxError("a malformed object key");
    index = skipWhitespace(raw, keyEnd);
    if (raw[index] !== ":") return properties;
    index = skipWhitespace(raw, index + 1);
    properties.push({ key, valueStart: index });
    const valueEnd = completeJsonValueEnd(raw, index);
    if (valueEnd === null) return properties;
    index = skipWhitespace(raw, valueEnd);
    if (raw[index] === ",") {
      index += 1;
      continue;
    }
    return properties;
  }
}

/**
 * Advances past JSON whitespace.
 *
 * @param source - JSON source.
 * @param start - Candidate token offset.
 * @returns First non-whitespace offset.
 */
function skipWhitespace(source: string, start: number): number {
  let index = start;
  while (index < source.length && /\s/u.test(source[index] ?? "")) index += 1;
  return index;
}

/**
 * Finds the exclusive end of one complete JSON string token.
 *
 * @param source - JSON source.
 * @param start - Opening quote offset.
 * @returns Exclusive token end or null while incomplete.
 */
function completeJsonStringEnd(source: string, start: number): number | null {
  if (source[start] !== '"') return null;
  let escaped = false;
  for (let index = start + 1; index < source.length; index += 1) {
    const character = source[index];
    if (escaped) escaped = false;
    else if (character === "\\") escaped = true;
    else if (character === '"') return index + 1;
  }
  return null;
}

/**
 * Finds the exclusive end of one complete JSON value without parsing incomplete input.
 *
 * @param source - JSON source.
 * @param start - Value offset.
 * @returns Exclusive value end or null while incomplete.
 */
function completeJsonValueEnd(source: string, start: number): number | null {
  const first = source[start];
  if (first === '"') return completeJsonStringEnd(source, start);
  if (first === "{" || first === "[") {
    const stack = [first];
    let inString = false;
    let escaped = false;
    for (let index = start + 1; index < source.length; index += 1) {
      const character = source[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') inString = false;
        continue;
      }
      if (character === '"') inString = true;
      else if (character === "{" || character === "[") stack.push(character);
      else if (character === "}" || character === "]") {
        const open = stack.pop();
        if ((open === "{" && character !== "}") || (open === "[" && character !== "]")) {
          throw new SyntaxError("malformed nested JSON");
        }
        if (stack.length === 0) return index + 1;
      }
    }
    return null;
  }
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (character === "," || character === "}") {
      const token = source.slice(start, index).trim();
      if (!token) return null;
      try {
        JSON.parse(token);
      } catch {
        throw new SyntaxError("malformed JSON value");
      }
      return index;
    }
  }
  return null;
}

/**
 * Extracts decoded top-level object keys while rejecting malformed or nested ambiguity.
 *
 * @param raw - Complete JSON object source.
 * @returns Top-level keys in source order, including duplicates.
 */
export function topLevelKeys(raw: string): string[] {
  return scanTopLevelProperties(raw).map(({ key }) => key);
}
