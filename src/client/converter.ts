import * as ColorCodec from "../State/ColorCodec.res.mjs";
import * as FaceletCodec from "../State/FaceletCodec.res.mjs";
import * as NetCodec from "../State/NetCodec.res.mjs";
import * as StateTypes from "../State/StateTypes.res.mjs";

type Result<T> = {TAG: "Ok"; _0: T} | {TAG: "Error"; _0: StateError};
type StateError = {_0?: string; TAG: string; actual?: number; character?: string; expected?: number; index?: number};
type CubeState = {size: number; facelets: string[][]};
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

  const describeError = (reason: StateError): string => {
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

  const parseState = (value: string): Result<CubeState> => {
    if (value === "") return StateTypes.solved(size) as Result<CubeState>;
    if (value.includes("\n")) {
      const faceNet = NetCodec.parse(size, value) as Result<CubeState>;
      return faceNet.TAG === "Ok"
        ? faceNet
        : (ColorCodec.parseNet(scheme(), size, value) as Result<CubeState>);
    }
    const facelets = FaceletCodec.parse(size, value) as Result<CubeState>;
    return facelets.TAG === "Ok"
      ? facelets
      : (ColorCodec.parseCompact(scheme(), size, value) as Result<CubeState>);
  };

  const setOutput = (key: string, value: string) => {
    const output = root.querySelector<HTMLElement>(`[data-output="${key}"]`);
    if (output) output.textContent = value;
  };

  const update = () => {
    const value = input.value.trim();
    const parsed = parseState(value);
    if (parsed.TAG === "Error") {
      status.textContent = "Parse error";
      status.classList.add("error");
      error.textContent = describeError(parsed._0);
      error.hidden = false;
      for (const key of ["facelets", "net", "colours", "colour-net"]) setOutput(key, "—");
      return;
    }

    status.textContent = value === "" ? "Solved default" : "State detected";
    status.classList.remove("error");
    error.hidden = true;
    setOutput("facelets", FaceletCodec.render(parsed._0));
    setOutput("net", NetCodec.render(parsed._0));
    const colours = ColorCodec.renderCompact(scheme(), parsed._0) as Result<string>;
    const colourNet = ColorCodec.renderNet(scheme(), parsed._0) as Result<string>;
    setOutput("colours", colours.TAG === "Ok" ? colours._0 : "—");
    setOutput("colour-net", colourNet.TAG === "Ok" ? colourNet._0 : "—");
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
      if (!output || output.textContent === "—") return;
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
