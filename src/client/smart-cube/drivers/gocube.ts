import type {SmartCubeDriver} from "./types";

export const goCubeDriver: SmartCubeDriver = {
  brand: "gocube",
  brandName: "GoCube / Rubik's Connected",
  protocolIds: ["gocube"],
  matchesDeviceName: (name) => /^(GoCube|Rubik)/i.test(name.trim()),
};
