import type {SmartCubeBrand} from "../types";

export type SmartCubeDriver = {
  brand: SmartCubeBrand;
  brandName: string;
  protocolIds: readonly string[];
  /** Device-name override for compatible protocols sold under another brand. */
  matchesDeviceName: (deviceName: string) => boolean;
};
