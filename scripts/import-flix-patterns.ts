import {readFile, writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {
  algorithmSolvesState,
  inverseAlgorithm,
  patternStateFromAlgorithm,
  patternStateKey,
} from "../src/State/PatternState.res.mjs";

type Imported = {
  size: number;
  name: string;
  canonical: string;
  sourceId: string;
  sourceUrl: string;
  publishedNotation: string;
  construction: string;
  solution: string;
  solutionKind: "proven optimal" | "known replayable" | "published inverse";
  stateKey: string;
};

const sourceRoot = resolve(import.meta.dir, "../../flix-cubesolve/src/CubeSolve/Patterns");
const destination = resolve(import.meta.dir, "../src/client/patterns.generated.ts");

const sourceUrls: Record<string, string> = {
  speedsolving: "https://www.speedsolving.com/wiki/index.php/List_of_pretty_patterns",
  ruwix1: "https://ruwix.com/the-rubiks-cube/rubiks-cube-patterns-algorithms/",
  ruwix2: "https://ruwix.com/the-rubiks-cube/rubiks-cube-patterns-algorithms/more-rubiks-patterns/",
  randelshofer: "https://www.randelshofer.ch/rubik/patterns_pocket.html",
  kewbz3: "https://kewbz.co.uk/blogs/solutions-guides/cool-3x3-rubiks-cube-patterns",
  kewbz4: "https://kewbz.co.uk/blogs/solutions-guides/4x4-patterns",
  kewbz5: "https://kewbz.co.uk/blogs/solutions-guides/5x5-patterns",
};

const normalizeLargeCubeNotation = (size: number, notation: string): string => {
  const explicitLegacyInnerFaces = notation.replace(
    /(?<![A-Za-z])([urfdlb])([2']?)/g,
    (_match, face: string, suffix: string) => `2${face.toUpperCase()}${suffix}`,
  );
  return explicitLegacyInnerFaces.replace(
    /(?<![A-Za-z])([MESmes])([2']?)/g,
    (_match, slice: string, suffix: string) => {
      const face = ({M: "L", E: "D", S: "F"} as const)[slice.toUpperCase() as "M" | "E" | "S"];
      if (size % 2 === 1) return `${Math.ceil(size / 2)}${face}${suffix}`;
      const opposite = ({L: "R", D: "U", F: "B"} as const)[face];
      const base = `(${size / 2}${face} ${size / 2}${opposite}')`;
      return suffix === "'" ? `${base}'` : suffix === "2" ? `${base}2` : base;
    },
  );
};

const patternBodies = (source: string): string[] => {
  const bodies: string[] = [];
  let cursor = 0;
  while ((cursor = source.indexOf("Pattern(", cursor)) >= 0) {
    let depth = 0;
    let quoted = false;
    let escaped = false;
    let end = cursor;
    for (; end < source.length; end += 1) {
      const character = source[end];
      if (quoted) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') quoted = false;
      } else if (character === '"') quoted = true;
      else if (character === "(") depth += 1;
      else if (character === ")" && --depth === 0) break;
    }
    const body = source.slice(cursor, end + 1);
    if (/^Pattern\(\s*"/.test(body)) bodies.push(body);
    cursor = end + 1;
  }
  return bodies;
};

const stringArguments = (body: string): string[] => {
  const strings = body.match(/"(?:\\.|[^"\\])*"/g) ?? [];
  return strings.map((value) => JSON.parse(value)).reduce<string[]>((arguments_, value) => {
    // Continued Flix string literals are joined with `+`; every Pattern field is
    // otherwise a literal, so the record arity tells us where continuations end.
    arguments_.push(value);
    return arguments_;
  }, []);
};

const splitFields = (body: string, arity: number): string[] => {
  const inner = body.slice(body.indexOf("(") + 1, -1);
  const fields: string[] = [];
  let start = 0;
  let quoted = false;
  let escaped = false;
  let depth = 0;
  for (let index = 0; index <= inner.length; index += 1) {
    const character = inner[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
    } else if (character === '"') quoted = true;
    else if (character === "(") depth += 1;
    else if (character === ")") depth -= 1;
    else if ((character === "," && depth === 0) || index === inner.length) {
      const literals = stringArguments(inner.slice(start, index));
      fields.push(literals.join(""));
      start = index + 1;
    }
  }
  if (fields.length !== arity) throw new Error(`Expected ${arity} fields, found ${fields.length}: ${body}`);
  return fields;
};

const importFile = async (
  filename: string,
  size: number,
  arity: number,
): Promise<Imported[]> => {
  const source = await readFile(resolve(sourceRoot, filename), "utf8");
  return patternBodies(source).map((body) => {
    const fields = splitFields(body, arity);
    const [name, canonical, sourceId, publishedNotation] = fields;
    const construction = size === 2 || size === 3
      ? fields[4]
      : normalizeLargeCubeNotation(size, publishedNotation);
    const solution = inverseAlgorithm(size, construction);
    const state = patternStateFromAlgorithm(size, construction);
    if (!algorithmSolvesState(state, solution)) throw new Error(`${size}x${size} ${name}: inverse failed replay.`);
    return {
      size,
      name,
      canonical,
      sourceId,
      sourceUrl: sourceUrls[sourceId],
      publishedNotation,
      construction,
      solution,
      solutionKind: size === 2
        ? "proven optimal"
        : size === 3
          ? "known replayable"
          : "published inverse",
      stateKey: patternStateKey(state),
    };
  });
};

const patterns = (
  await Promise.all([
    importFile("Pocket.flix", 2, 5),
    importFile("Standard.flix", 3, 5),
    importFile("Revenge.flix", 4, 4),
    importFile("Professor.flix", 5, 4),
  ])
).flat();

const counts = new Map<number, number>();
for (const pattern of patterns) counts.set(pattern.size, (counts.get(pattern.size) ?? 0) + 1);
const expected = new Map([[2, 89], [3, 112], [4, 13], [5, 15]]);
for (const [size, count] of expected) {
  if (counts.get(size) !== count) throw new Error(`Expected ${count} ${size}x${size} patterns, found ${counts.get(size)}.`);
}

const banner = `// Generated by scripts/import-flix-patterns.ts from flix-cubesolve commit\n`
  + `// 113279e59342a4db17adcf33c3090f0940d25cea. Do not edit by hand.\n\n`;
await writeFile(destination, `${banner}export const importedPatterns = ${JSON.stringify(patterns, null, 2)} as const;\n`);
console.log(`Imported ${patterns.length} patterns (${[...counts].map(([size, count]) => `${size}x${size}: ${count}`).join(", ")}).`);
