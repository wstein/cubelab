import type {SmartCubeDriver} from "./types";

export const ganDriver: SmartCubeDriver = {
  brand: "gan",
  brandName: "GAN",
  protocolIds: ["gan-gen1", "gan-gen2", "gan-gen3", "gan-gen4"],
  matchesDeviceName: (name) => /^(GAN|MG)/i.test(name.trim()),
};
