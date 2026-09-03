/** Lazy, structural parser for Hamilton-style macro programs. */
export type Node =
  | {kind: "move"; token: string; quarterTurns: bigint}
  | {kind: "pause"; durationMs: number}
  | {kind: "reference"; name: string; repeat: bigint}
  | {kind: "slice"; name: string; start: number; end?: number; repeat: bigint}
  | {kind: "sequence"; items: Node[]; repeat: bigint};

export type Program = {definitions: Map<string, Node[]>; exportName: string};
export type Measurement = {quarterTurns: bigint; sourceElements: bigint; depth: number};
export type ImportedProgram = {program: Program; implicitExport: boolean};

const identifier = /^[A-Za-z_][A-Za-z0-9_]*$/;
const move = /^[UDLRFB](?:2|')?$/;
const implicitExpressionRoot = "__expression__";

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

  private sequence(until?: string | string[]): Node[] {
    const items: Node[] = [];
    while (true) {
      this.space();
      const delimiter = this.source[this.cursor];
      if (this.cursor === this.source.length || (until !== undefined && (Array.isArray(until) ? until.includes(delimiter) : delimiter === until))) break;
      if (this.source[this.cursor] === "(") {
        this.cursor += 1;
        const body = this.sequence(")");
        if (this.source[this.cursor] !== ")") fail("unclosed group");
        this.cursor += 1;
        items.push({kind: "sequence", items: body, repeat: this.suffix()});
      } else if (this.source[this.cursor] === "[") {
        items.push(this.bracket());
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
      this.space();
      if (this.source[this.cursor] === "@") items.push(this.pause());
    }
    return items;
  }

  private bracket(): Node {
    this.cursor += 1;
    const left = this.sequence([",", ":", "]"]);
    const delimiter = this.source[this.cursor];
    if (delimiter !== "," && delimiter !== ":") fail("a bracket expression requires ',' or ':'");
    this.cursor += 1;
    const right = this.sequence("]");
    if (this.source[this.cursor] !== "]") fail("unclosed bracket expression");
    this.cursor += 1;
    if (left.length === 0 || right.length === 0) fail("a bracket expression requires moves on both sides");
    const inverse = (items: Node[]): Node => ({kind: "sequence", items, repeat: -1n});
    const items = delimiter === ","
      ? [...left, ...right, inverse(left), inverse(right)]
      : [...left, ...right, inverse(left)];
    return {kind: "sequence", items, repeat: this.suffix()};
  }

  private pause(): Node {
    const start = this.cursor;
    this.cursor += 1;
    const secondsStart = this.cursor;
    while (/\d/.test(this.source[this.cursor] ?? "")) this.cursor += 1;
    if (this.source[this.cursor] === ".") {
      this.cursor += 1;
      const fractionStart = this.cursor;
      while (/\d/.test(this.source[this.cursor] ?? "")) this.cursor += 1;
      if (fractionStart === this.cursor) fail("a timed pause requires digits after the decimal point");
    }
    if (secondsStart === this.cursor || this.source[this.cursor] !== "s") {
      fail(`invalid timed pause at ${start}; use @0.6s`);
    }
    const seconds = Number(this.source.slice(secondsStart, this.cursor));
    this.cursor += 1;
    const durationMs = Math.round(seconds * 1000);
    if (!Number.isFinite(durationMs) || durationMs < 1 || durationMs > 60_000) fail("a timed pause must be between 0.001s and 60s");
    return {kind: "pause", durationMs};
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

const delimiterBalance = (text: string): number => [...text].reduce((balance, character) => {
  if (character === "(" || character === "[") return balance + 1;
  if (character === ")" || character === "]") return balance - 1;
  return balance;
}, 0);

type SourceStatement = {name: string; body: string};

/** Splits macro definitions at top-level lines without flattening multiline groups. */
const statements = (text: string): {definitions: SourceStatement[]; root: string; exported?: string} => {
  const definitions: SourceStatement[] = [];
  const rootLines: string[] = [];
  const lines = text.split("\n");
  let exported: string | undefined;
  for (let index = 0; index < lines.length;) {
    const line = lines[index].trim();
    index += 1;
    if (line === "") continue;
    const exportName = line.match(/^export\s+([A-Za-z_][A-Za-z0-9_]*)\s*$/)?.[1];
    if (exportName) {
      if (exported !== undefined) fail("duplicate export declaration");
      exported = exportName;
      continue;
    }
    const definition = line.match(/^(?:def\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!definition) {
      rootLines.push(line);
      continue;
    }
    const name = definition[1];
    const bodyLines = [definition[2]];
    let balance = delimiterBalance(definition[2]);
    while (balance > 0 && index < lines.length) {
      const continuation = lines[index];
      index += 1;
      bodyLines.push(continuation);
      balance += delimiterBalance(continuation);
    }
    if (balance !== 0) fail(`unclosed group in definition '${name}'`);
    definitions.push({name, body: bodyLines.join("\n")});
  }
  return {definitions, root: rootLines.join("\n"), exported};
};

export const parse = (source: string): Program => {
  const text = clean(source).trim();
  const definitions = new Map<string, Node[]>();
  const sourceStatements = statements(text);
  for (const {name, body} of sourceStatements.definitions) {
    if (definitions.has(name)) fail(`duplicate definition '${name}'`);
    definitions.set(name, new ExpressionParser(body).parse());
  }
  const {exported} = sourceStatements;
  if (definitions.size === 0) {
    if (text === "") fail("expected an expression or macro definition");
    definitions.set(implicitExpressionRoot, new ExpressionParser(text).parse());
    return {definitions, exportName: implicitExpressionRoot};
  }
  const bareDefinitionRoot = sourceStatements.root.trim();
  const hasBareDefinitionRoot = identifier.test(bareDefinitionRoot) && definitions.has(bareDefinitionRoot);
  if (sourceStatements.root !== "" && !hasBareDefinitionRoot) {
    definitions.set(implicitExpressionRoot, new ExpressionParser(sourceStatements.root).parse());
  }
  const exportName = exported
    ?? (sourceStatements.root === ""
      ? [...definitions.keys()].at(-1)!
      : hasBareDefinitionRoot ? bareDefinitionRoot : implicitExpressionRoot);
  if (!definitions.has(exportName)) fail(`export '${exportName}' is not defined`);
  return {definitions, exportName};
};

/**
 * Imports a text-based `.alg` source. Legacy Hamilton sources commonly omit
 * `export`; in that case the final definition is the intentionally explicit
 * imported root. Standard parsing remains strict about a missing export.
 */
export const importAlg = (source: string): ImportedProgram => {
  const normalized = source.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  return {
    program: parse(normalized),
    implicitExport: !/(?:^|\n)\s*export\s+/m.test(normalized),
  };
};

export const measure = (program: Program, name = program.exportName): Measurement => {
  const memo = new Map<string, Measurement>();
  const visiting: string[] = [];
  const node = (value: Node): Measurement => {
    if (value.kind === "move") return {quarterTurns: value.quarterTurns, sourceElements: 1n, depth: 1};
    if (value.kind === "pause") return {quarterTurns: 0n, sourceElements: 1n, depth: 1};
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

export type StreamEvent = {kind: "move"; token: string} | {kind: "pause"; durationMs: number};

/** Streams atomic moves and timed pauses without materializing a macro expansion. */
export function* streamEvents(program: Program, name = program.exportName): Generator<StreamEvent> {
  const walkDefinition = function* (key: string, inverted: boolean): Generator<StreamEvent> {
    const body = program.definitions.get(key);
    if (!body) fail(`undefined macro '${key}'`);
    yield* walkItems(body, inverted);
  };
  const walkItems = function* (items: Node[], inverted: boolean): Generator<StreamEvent> {
    const ordered = inverted ? [...items].reverse() : items;
    for (const item of ordered) yield* walk(item, inverted);
  };
  const walk = function* (node: Node, inheritedInverse: boolean): Generator<StreamEvent> {
    if (node.kind === "move") {
      yield {kind: "move", token: inheritedInverse ? invertToken(node.token) : node.token};
      return;
    }
    if (node.kind === "pause") {
      yield {kind: "pause", durationMs: node.durationMs};
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

/** Streams only moves for consumers that intentionally ignore timed pauses. */
export function* stream(program: Program, name = program.exportName): Generator<string> {
  for (const event of streamEvents(program, name)) {
    if (event.kind === "move") yield event.token;
  }
}

/** Materializes a deliberately bounded move stream for ordinary tape playback. */
export const unfold = (program: Program, maxMoves: number, name = program.exportName): StreamEvent[] => {
  const events: StreamEvent[] = [];
  let moves = 0;
  for (const event of streamEvents(program, name)) {
    if (event.kind === "move") {
      moves += 1;
      if (moves > maxMoves) fail(`expansion exceeds the ${maxMoves}-move limit`);
    }
    events.push(event);
  }
  return events;
};

export const prefix = (program: Program, limit: number, name = program.exportName): string[] => {
  const output: string[] = [];
  for (const token of stream(program, name)) {
    output.push(token);
    if (output.length >= limit) break;
  }
  return output;
};

export type StreamPlayer = {
  next: () => IteratorResult<StreamEvent>;
  readonly movesPlayed: bigint;
  readonly done: boolean;
};

/** Owns one resumable macro stream for long-running playback consumers. */
export const createStreamPlayer = (program: Program, name = program.exportName): StreamPlayer => {
  const iterator = streamEvents(program, name);
  let movesPlayed = 0n;
  let done = false;
  return {
    next: () => {
      const next = iterator.next();
      if (!next.done && next.value.kind === "move") movesPlayed += 1n;
      else done = true;
      return next;
    },
    get movesPlayed() { return movesPlayed; },
    get done() { return done; },
  };
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
