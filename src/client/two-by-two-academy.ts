import * as FaceletCodec from "../State/FaceletCodec.res.mjs";
import * as PieceReducer from "../State/PieceReducer.res.mjs";

/**
 * A 2×2 has no fixed centres. The final Academy goal therefore accepts every
 * monochrome whole-cube orientation rather than one particular URFDLB frame.
 */
export const isMonochromeSolved2x2 = (state: unknown): boolean => {
  const facelets = FaceletCodec.render(state);
  return facelets.length === 24
    && Array.from({length: 6}, (_, face) => {
      const stickers = facelets.slice(face * 4, face * 4 + 4);
      return stickers.length === 4 && stickers.split("").every((colour) => colour === stickers[0]);
    }).every(Boolean);
};

export type TwoByTwoPhaseStatus = {
  firstLayer: boolean;
  orientLastLayer: boolean;
  permuteLastLayer: boolean;
};

/**
 * The reducer's corner order is URF, UFL, ULB, UBR, DFR, DLF, DBL, DRB.
 * A Beginner/Ortega route fixes the four D-layer corners first, then orients
 * the remaining U-layer corners, and finally permutes those corners.
 */
export const twoByTwoPhaseStatus = (state: unknown): TwoByTwoPhaseStatus => {
  const reduced = PieceReducer.reduce(state);
  if (reduced.TAG !== "Ok") {
    return {firstLayer: false, orientLastLayer: false, permuteLastLayer: false};
  }
  const {cp, co} = reduced._0 as {cp: number[]; co: number[]};
  const firstLayer = [4, 5, 6, 7].every((slot) => cp[slot] === slot && co[slot] === 0);
  const orientLastLayer = firstLayer && [0, 1, 2, 3].every((slot) => co[slot] === 0);
  return {
    firstLayer,
    orientLastLayer,
    permuteLastLayer: isMonochromeSolved2x2(state),
  };
};

export const twoByTwoBeginnerPhaseDefinitions = [
  {
    number: 1,
    title: "Build the first layer",
    instruction: "Place and orient the four bottom-layer corners without relying on fixed centres.",
  },
  {
    number: 2,
    title: "Orient last-layer corners",
    instruction: "Keep the first layer intact while turning every last-layer corner upright.",
  },
  {
    number: 3,
    title: "Permute last-layer corners",
    instruction: "Cycle the oriented last-layer corners until all six faces are monochrome.",
  },
] as const;
