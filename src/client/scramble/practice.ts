const faces = ["U", "R", "F", "D", "L", "B"] as const;
const suffixes = ["", "2", "'"] as const;

const axis = (face: string): number => {
  if (face === "U" || face === "D") return 0;
  if (face === "R" || face === "L") return 1;
  return 2;
};

/**
 * Lightweight 3×3 practice fallback. It avoids repeated faces and same-axis
 * sandwiches such as R L R, while remaining synchronous and allocation-light.
 */
export const practiceScramble = (random: () => number = Math.random, length = 20): string => {
  const selected: string[] = [];
  while (selected.length < length) {
    const face = faces[Math.floor(random() * faces.length)]!;
    const previous = selected.at(-1);
    const beforePrevious = selected.at(-2);
    if (face === previous) continue;
    if (beforePrevious === face && previous !== undefined && axis(previous) === axis(face)) continue;
    const suffix = suffixes[Math.floor(random() * suffixes.length)]!;
    selected.push(`${face}${suffix}`);
  }
  return selected.join(" ");
};
