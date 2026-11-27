import {
  getActiveTeamName,
  runWithTeam,
  TEAM_ATTRIBUTE_KEY,
} from "./teamContext";

export type MfeTelemetryBridge = {
  getTeamName: () => string;
  teamAttributeKey: string;
  runWithTeam: typeof runWithTeam;
};

declare global {
  // eslint-disable-next-line no-var
  var __MFE_TELEMETRY__: MfeTelemetryBridge | undefined;
}

export function installTelemetryBridge(): void {
  globalThis.__MFE_TELEMETRY__ = {
    getTeamName: () => getActiveTeamName(),
    teamAttributeKey: TEAM_ATTRIBUTE_KEY,
    runWithTeam,
  };
}