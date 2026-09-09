import {
  createSmartCubeSession,
  type SmartCubeSession,
} from "@wstein/regrip-core/session/smartCubeSession";
import type {SmartCubeTransportConnection} from "@wstein/regrip-core/bindings/smartCubeTransport";
import type {SessionFeaturesPatch} from "@wstein/regrip-core/session/features";

import {smartCubeTransportConnector} from "./bluetooth";

/**
 * Temporary GAN/GoCube migration seam.
 *
 * CubeLab retains its established chooser, direct GoCube UART path, and GAN i4
 * MAC recovery. The returned core session owns only normalized lifecycle,
 * profile, gyro, virtual-regrip, and replay behavior. The existing
 * `createSmartCubeManager()` remains the default UI transport until parity is
 * proven per protocol family.
 */
export type RegripCoreSessionOptions = {
  connect?: () => Promise<SmartCubeTransportConnection>;
  features?: SessionFeaturesPatch;
};

export const createRegripCoreSession = (
  options: RegripCoreSessionOptions = {},
): SmartCubeSession =>
  createSmartCubeSession({
    connect: options.connect ?? smartCubeTransportConnector,
    features: options.features,
  });
