import {ganDriver} from "./gan";
import {giikerDriver} from "./giiker";
import {goCubeDriver} from "./gocube";
import {moyuDriver} from "./moyu";
import type {SmartCubeDriver} from "./types";

export const smartCubeDrivers: readonly SmartCubeDriver[] = [
  moyuDriver,
  ganDriver,
  giikerDriver,
  goCubeDriver,
];

export const resolveSmartCubeDriver = (
  protocolId: string,
  deviceName: string,
): SmartCubeDriver | null => {
  const namedMatch = smartCubeDrivers.find(
    (driver) => driver.matchesDeviceName(deviceName) && driver.protocolIds.includes(protocolId),
  );
  if (namedMatch) return namedMatch;

  // MoYu AI 2023 advertises as AiCube but uses the GAN Gen2 transport.
  if (protocolId === "gan-gen2" && moyuDriver.matchesDeviceName(deviceName)) return moyuDriver;

  return smartCubeDrivers.find((driver) => driver.protocolIds.includes(protocolId)) ?? null;
};

export type {SmartCubeDriver} from "./types";
