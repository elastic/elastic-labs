import { installTeamProcessors, installTelemetryBridge } from "@mfe/telemetry";

installTelemetryBridge();
installTeamProcessors();

import("./bootstrap");