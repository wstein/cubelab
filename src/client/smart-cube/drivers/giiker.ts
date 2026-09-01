import type {SmartCubeDriver} from "./types";

export const giikerDriver: SmartCubeDriver = {
  brand: "giiker",
  brandName: "GiiKER",
  protocolIds: ["giiker"],
  matchesDeviceName: (name) => /^(Gi|Hi-|Mi Smart Magic Cube)/i.test(name.trim()),
};
