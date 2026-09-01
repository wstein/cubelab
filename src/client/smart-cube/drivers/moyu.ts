import type {SmartCubeDriver} from "./types";

export const moyuDriver: SmartCubeDriver = {
  brand: "moyu",
  brandName: "MoYu",
  protocolIds: ["moyu-mhc", "moyu32"],
  // AiCube models use GAN Gen2 framing and must win over protocol-only GAN detection.
  matchesDeviceName: (name) => /^(AiCube|MHC|WCU_MY|MoYu)/i.test(name.trim()),
};
