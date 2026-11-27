import type { Context } from "@opentelemetry/api";

import {
  getActiveTeamName,
  runWithTeam,
  TEAM_ATTRIBUTE_KEY,
} from "./teamContext";

export type MfeTelemetryBridge = {
  getTeamName: (ctx?: Context) => string;
  teamAttributeKey: string;
  runWithTeam: typeof runWithTeam;
};

declare global {
  // eslint-disable-next-line no-var
  var __MFE_TELEMETRY__: MfeTelemetryBridge | undefined;
}

export function installTelemetryBridge(): void {
  globalThis.__MFE_TELEMETRY__ = {
    getTeamName: (ctx?: Context) => getActiveTeamName(ctx),
    teamAttributeKey: TEAM_ATTRIBUTE_KEY,
    runWithTeam,
  };
}