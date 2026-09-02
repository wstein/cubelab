/** Lazy, structural parser for Hamilton-style macro programs. */
export type Node =
  | {kind: "move"; token: string; quarterTurns: bigint}
  | {kind: "reference"; name: string; repeat: bigint}
  | {kind: "slice"; name: string; start: number; end?: number; repeat: bigint}
  | {kind: "sequence"; items: Node[]; repeat: bigint};

export type Program = {definitions: Map<string, Node[]>; exportName: string};
export type Measurement = {quarterTurns: bigint; sourceElements: bigint; depth: number};

const identifier = /^[A-Za-z_][A-Za-z0-9_]*$/;
const move = /^[UDLRFB](?:2|')?$/;

const fail = (message: string): never => { throw new Error(`Hamilton macro: ${message}`); };

const clean = (source: string): string => source.replace(/^[ \t]*#.*$/gm, "");

class ExpressionParser {
  private cursor = 0;
  constructor(private readonly source: string) {}

  parse(): Node[] {
    const items = this.sequence();
    this.space();
    if (this.cursor !== this.source.length) fail(`unexpected '${this.source[this.cursor]}'`);
    return items;
  }

  private sequence(until?: string): Node[] {
    const items: Node[] = [];
    while (true) {
      this.space();
      if (this.cursor === this.source.length || this.source[this.cursor] === until) break;
      if (this.source[this.cursor] === "(") {
        this.cursor += 1;
        const body = this.sequence(")");
        if (this.source[this.cursor] !== ")") fail("unclosed group");
        this.cursor += 1;
        items.push({kind: "sequence", items: body, repeat: this.suffix()});
      } else {
        const token = this.word();
        if (move.test(token)) {
          const quarterTurns = token.endsWith("2") ? 2n : 1n;
          items.push({kind: "move", token, quarterTurns});
        } else {
          const inverted = token.endsWith("'");
          const name = inverted ? token.slice(0, -1) : token;
          if (identifier.test(name)) {
            if (!inverted && this.source[this.cursor] === "(") {
              items.push(this.slice(name));
              continue;
            }
            const repeat = this.suffix();
            items.push({kind: "reference", name, repeat: inverted ? -repeat : repeat});
          } else {
            fail(`invalid token '${token}'`);
          }
        }
      }
    }
    return items;
  }

  private slice(name: string): Node {
    this.cursor += 1;
    const start = this.integer();
    let end: number | undefined;
    if (this.source[this.cursor] === ",") {
      this.cursor += 1;
      end = this.integer();
    }
    if (this.source[this.cursor] !== ")") fail("unclosed macro slice");
    this.cursor += 1;
    return {kind: "slice", name, start, end, repeat: this.suffix()};
  }

  private integer(): number {
    const start = this.cursor;
    while (/\d/.test(this.source[this.cursor] ?? "")) this.cursor += 1;
    if (start === this.cursor) fail("macro slice indices must be non-negative integers");
    return Number(this.source.slice(start, this.cursor));
  }

  private suffix(): bigint {
    this.space();
    const start = this.cursor;
    while (/\d/.test(this.source[this.cursor] ?? "")) this.cursor += 1;
    const amount = start === this.cursor ? 1n : BigInt(this.source.slice(start, this.cursor));
    if (this.source[this.cursor] === "'") {
      this.cursor += 1;
      return -amount;
    }
    return amount;
  }

  private word(): string {
    const start = this.cursor;
    while (/[A-Za-z0-9_']/.test(this.source[this.cursor] ?? "")) this.cursor += 1;
    if (start === this.cursor) fail(`expected a token at ${start}`);
    return this.source.slice(start, this.cursor);
  }

  private space(): void { while (/\s/.test(this.source[this.cursor] ?? "")) this.cursor += 1; }
}

export const parse = (source: string): Program => {
  const text = clean(source);
  const definitions = new Map<string, Node[]>();
  const matches = [...text.matchAll(/(?:^|\n)\s*(?:def\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/g)];
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const name = match[1];
    const bodyStart = (match.index ?? 0) + match[0].length;
    const bodyEnd = index + 1 < matches.length
      ? (matches[index + 1].index ?? text.length)
      : (text.search(/(?:^|\n)\s*export\s+/m) >= 0 ? text.search(/(?:^|\n)\s*export\s+/m) : text.length);
    if (definitions.has(name)) fail(`duplicate definition '${name}'`);
    definitions.set(name, new ExpressionParser(text.slice(bodyStart, bodyEnd)).parse());
  }
  const exported = text.match(/(?:^|\n)\s*export\s+([A-Za-z_][A-Za-z0-9_]*)\s*$/m)?.[1];
  if (!exported) fail("missing 'export <name>'");
  if (!definitions.has(exported)) fail(`export '${exported}' is not defined`);
  return {definitions, exportName: exported};
};

export const measure = (program: Program, name = program.exportName): Measurement => {
  const memo = new Map<string, Measurement>();
  const visiting: string[] = [];
  const node = (value: Node): Measurement => {
    if (value.kind === "move") return {quarterTurns: value.quarterTurns, sourceElements: 1n, depth: 1};
    if (value.kind === "reference") {
      const base = definition(value.name);
      return {quarterTurns: base.quarterTurns * (value.repeat < 0n ? -value.repeat : value.repeat), sourceElements: 1n, depth: base.depth + 1};
    }
    if (value.kind === "slice") {
      const body = program.definitions.get(value.name);
      if (!body) fail(`undefined macro '${value.name}'`);
      const end = value.end ?? body.length;
      if (value.start > end || end > body.length) fail(`slice '${value.name}(${value.start},${end})' is outside its ${body.length} source elements`);
      const base = body.slice(value.start, end).reduce((total, item) => {
        const next = node(item);
        return {quarterTurns: total.quarterTurns + next.quarterTurns, sourceElements: total.sourceElements + next.sourceElements, depth: Math.max(total.depth, next.depth)};
      }, {quarterTurns: 0n, sourceElements: 0n, depth: 1});
      return {quarterTurns: base.quarterTurns * (value.repeat < 0n ? -value.repeat : value.repeat), sourceElements: BigInt(end - value.start), depth: base.depth + 1};
    }
    const base = value.items.reduce((total, item) => {
      const next = node(item);
      return {quarterTurns: total.quarterTurns + next.quarterTurns, sourceElements: total.sourceElements + next.sourceElements, depth: Math.max(total.depth, next.depth)};
    }, {quarterTurns: 0n, sourceElements: 0n, depth: 1});
    return {quarterTurns: base.quarterTurns * (value.repeat < 0n ? -value.repeat : value.repeat), sourceElements: 1n, depth: base.depth + 1};
  };
  const definition = (key: string): Measurement => {
    const cached = memo.get(key);
    if (cached) return cached;
    if (visiting.includes(key)) fail(`cyclic definition: ${[...visiting, key].join(" -> ")}`);
    const body = program.definitions.get(key);
    if (!body) fail(`undefined macro '${key}'`);
    visiting.push(key);
    const result = body.reduce((total, item) => {
      const next = node(item);
      return {quarterTurns: total.quarterTurns + next.quarterTurns, sourceElements: total.sourceElements + next.sourceElements, depth: Math.max(total.depth, next.depth)};
    }, {quarterTurns: 0n, sourceElements: 0n, depth: 1});
    visiting.pop(); memo.set(key, result); return result;
  };
  return definition(name);
};

const invertToken = (token: string): string => token.endsWith("2")
  ? token
  : token.endsWith("'") ? token.slice(0, -1) : `${token}'`;

/** Streams atomic moves without materializing a macro expansion. */
export function* stream(program: Program, name = program.exportName): Generator<string> {
  const walkDefinition = function* (key: string, inverted: boolean): Generator<string> {
    const body = program.definitions.get(key);
    if (!body) fail(`undefined macro '${key}'`);
    yield* walkItems(body, inverted);
  };
  const walkItems = function* (items: Node[], inverted: boolean): Generator<string> {
    const ordered = inverted ? [...items].reverse() : items;
    for (const item of ordered) yield* walk(item, inverted);
  };
  const walk = function* (node: Node, inheritedInverse: boolean): Generator<string> {
    if (node.kind === "move") {
      yield inheritedInverse ? invertToken(node.token) : node.token;
      return;
    }
    const repeat = node.repeat < 0n ? -node.repeat : node.repeat;
    const inverted = inheritedInverse !== (node.repeat < 0n);
    for (let index = 0n; index < repeat; index += 1n) {
      if (node.kind === "reference") yield* walkDefinition(node.name, inverted);
      else if (node.kind === "slice") {
        const body = program.definitions.get(node.name);
        if (!body) fail(`undefined macro '${node.name}'`);
        const end = node.end ?? body.length;
        if (node.start > end || end > body.length) fail(`slice '${node.name}(${node.start},${end})' is outside its ${body.length} source elements`);
        yield* walkItems(body.slice(node.start, end), inverted);
      } else yield* walkItems(node.items, inverted);
    }
  };
  yield* walkDefinition(name, false);
}

export const prefix = (program: Program, limit: number, name = program.exportName): string[] => {
  const output: string[] = [];
  for (const token of stream(program, name)) {
    output.push(token);
    if (output.length >= limit) break;
  }
  return output;
};

/** Streams a bounded move window; the stream is never materialized. */
export const window = (program: Program, start: bigint, length: number, name = program.exportName): string[] => {
  const output: string[] = [];
  let index = 0n;
  for (const token of stream(program, name)) {
    if (index >= start) output.push(token);
    if (output.length >= length) break;
    index += 1n;
  }
  return output;
};
