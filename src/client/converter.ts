import * as ColorCodec from "../State/ColorCodec.res.mjs";
import * as FaceletCodec from "../State/FaceletCodec.res.mjs";
import * as NetCodec from "../State/NetCodec.res.mjs";
import * as Orbit64Codec from "../State/Orbit64Codec.res.mjs";
import * as PieceReducer from "../State/PieceReducer.res.mjs";
import * as StateTypes from "../State/StateTypes.res.mjs";
import * as MoveExecutor from "../Move/MoveExecutor.res.mjs";

type Result<T, E = StateError | string> = {TAG: "Ok"; _0: T} | {TAG: "Error"; _0: E};
type StateError = {_0?: string; TAG: string; actual?: number; character?: string; expected?: number; index?: number};
type CubeState = {size: number; facelets: string[][]};
type PieceState = {size: number; cp: number[]; co: number[]; ep: number[]; eo: number[]};
type Scheme = "Western" | "Japanese" | {TAG: "Custom"; _0: string};

const root = document.querySelector<HTMLElement>("[data-converter]");

if (root) {
  const input = root.querySelector<HTMLTextAreaElement>("[data-input]")!;
  const schemeSelect = root.querySelector<HTMLSelectElement>("[data-scheme]")!;
  const customScheme = root.querySelector<HTMLInputElement>("[data-custom-scheme]")!;
  const status = root.querySelector<HTMLElement>("[data-status]")!;
  const error = root.querySelector<HTMLElement>("[data-error]")!;
  let size = 3;

  const scheme = (): Scheme =>
    schemeSelect.value === "Custom"
      ? {TAG: "Custom", _0: customScheme.value.toUpperCase()}
      : (schemeSelect.value as "Western" | "Japanese");

  const describeError = (reason: StateError | string): string => {
    if (typeof reason === "string") return reason;
    switch (reason.TAG) {
      case "InvalidLength":
        return `Invalid length: expected ${reason.expected}, received ${reason.actual}.`;
      case "InvalidFacelet":
      case "InvalidColour":
        return `Invalid symbol '${reason.character}' at position ${reason.index}.`;
      case "InvalidColourCount":
        return `Every face or colour must occur exactly ${reason.expected} times.`;
      default:
        return reason._0 ?? "The cube state is invalid.";
    }
  };

  const parseState = (inputValue: string): Result<CubeState> => {
    const compact = inputValue.trim();
    if (compact === "") return StateTypes.solved(size) as Result<CubeState>;
    if ((size === 2 || size === 3) && compact.startsWith("cp:")) {
      const pieces = PieceReducer.parseState(size, compact) as Result<CubeState, unknown>;
      return pieces.TAG === "Ok"
        ? pieces
        : {TAG: "Error", _0: PieceReducer.describeError(pieces._0)};
    }
    if (size === 3 && /^[A-Za-z0-9_-]{12}$/.test(compact)) {
      const orbit = Orbit64Codec.decodeState(compact) as Result<CubeState, unknown>;
      return orbit.TAG === "Ok"
        ? orbit
        : {TAG: "Error", _0: Orbit64Codec.describeError(orbit._0)};
    }
    if (inputValue.includes("\n")) {
      const net = inputValue.trimEnd();
      const faceNet = NetCodec.parse(size, net) as Result<CubeState>;
      if (faceNet.TAG === "Ok") return faceNet;
      const colourNet = ColorCodec.parseNet(scheme(), size, net) as Result<CubeState>;
      return colourNet.TAG === "Ok"
        ? colourNet
        : (MoveExecutor.parseAndApply(size, inputValue) as Result<CubeState>);
    }
    const facelets = FaceletCodec.parse(size, compact) as Result<CubeState>;
    if (facelets.TAG === "Ok") return facelets;
    const colours = ColorCodec.parseCompact(scheme(), size, compact) as Result<CubeState>;
    return colours.TAG === "Ok"
      ? colours
      : (MoveExecutor.parseAndApply(size, inputValue) as Result<CubeState>);
  };

  const setOutput = (key: string, value: string, copyable = true) => {
    const output = root.querySelector<HTMLElement>(`[data-output="${key}"]`);
    if (output) output.textContent = value;
    const copy = root.querySelector<HTMLButtonElement>(`[data-copy="${key}"]`);
    if (copy) copy.disabled = !copyable;
  };

  const updateCardVisibility = () => {
    root.querySelectorAll<HTMLElement>("[data-output-card]").forEach((card) => {
      const supportedSizes = card.dataset.sizes;
      card.hidden = supportedSizes !== undefined && !supportedSizes.split(",").includes(String(size));
    });
    const pieceTitle = root.querySelector<HTMLElement>('[data-title="pieces"]');
    if (pieceTitle) {
      pieceTitle.textContent = size === 2 ? "2×2 CP / CO" : "3×3 CP / CO / EP / EO";
    }
  };

  const update = () => {
    updateCardVisibility();
    const value = input.value;
    const parsed = parseState(value);
    if (parsed.TAG === "Error") {
      status.textContent = "Parse error";
      status.classList.add("error");
      error.textContent = describeError(parsed._0);
      error.hidden = false;
      for (const key of ["facelets", "net", "colours", "colour-net", "pieces", "orbit64"]) {
        setOutput(key, "—", false);
      }
      return;
    }

    status.textContent = value.trim() === "" ? "Solved default" : "Input converted";
    status.classList.remove("error");
    error.hidden = true;
    setOutput("facelets", FaceletCodec.render(parsed._0));
    setOutput("net", NetCodec.render(parsed._0));
    const colours = ColorCodec.renderCompact(scheme(), parsed._0) as Result<string>;
    const colourNet = ColorCodec.renderNet(scheme(), parsed._0) as Result<string>;
    setOutput("colours", colours.TAG === "Ok" ? colours._0 : "—", colours.TAG === "Ok");
    setOutput(
      "colour-net",
      colourNet.TAG === "Ok" ? colourNet._0 : "—",
      colourNet.TAG === "Ok",
    );

    if (size === 2 || size === 3) {
      const pieces = PieceReducer.reduce(parsed._0) as Result<PieceState, unknown>;
      if (pieces.TAG === "Error") {
        setOutput(
          "pieces",
          `Unavailable — ${PieceReducer.describeError(pieces._0)}`,
          false,
        );
        if (size === 3) setOutput("orbit64", "Unavailable — invalid piece state", false);
      } else {
        const renderedPieces = PieceReducer.render(pieces._0) as Result<string, unknown>;
        setOutput(
          "pieces",
          renderedPieces.TAG === "Ok"
            ? renderedPieces._0
            : `Unavailable — ${PieceReducer.describeError(renderedPieces._0)}`,
          renderedPieces.TAG === "Ok",
        );
        if (size === 3) {
          const orbit = Orbit64Codec.encode(pieces._0) as Result<string, unknown>;
          setOutput(
            "orbit64",
            orbit.TAG === "Ok" ? orbit._0 : `Unavailable — ${Orbit64Codec.describeError(orbit._0)}`,
            orbit.TAG === "Ok",
          );
        }
      }
    }
  };

  root.querySelectorAll<HTMLButtonElement>("[data-size]").forEach((button) => {
    button.addEventListener("click", () => {
      size = Number(button.dataset.size);
      root.querySelectorAll<HTMLButtonElement>("[data-size]").forEach((candidate) => {
        const active = candidate === button;
        candidate.classList.toggle("active", active);
        candidate.setAttribute("aria-pressed", String(active));
      });
      update();
    });
  });

  schemeSelect.addEventListener("change", () => {
    customScheme.hidden = schemeSelect.value !== "Custom";
    update();
  });
  customScheme.addEventListener("input", () => {
    customScheme.value = customScheme.value.toUpperCase();
    update();
  });
  input.addEventListener("input", update);

  root.querySelectorAll<HTMLButtonElement>("[data-copy]").forEach((button) => {
    button.addEventListener("click", async () => {
      const key = button.dataset.copy;
      const output = key ? root.querySelector<HTMLElement>(`[data-output="${key}"]`) : null;
      if (button.disabled || !output || output.textContent === "—") return;
      await navigator.clipboard.writeText(output.textContent ?? "");
      button.textContent = "Copied";
      button.classList.add("copied");
      window.setTimeout(() => {
        button.textContent = "Copy";
        button.classList.remove("copied");
      }, 1500);
    });
  });

  update();
}
