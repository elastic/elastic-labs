import React, { useEffect, type ReactNode } from "react";

import { popActiveUiTeam, pushActiveUiTeam, runWithTeam } from "./teamContext";

export type MicrofrontendBoundaryProps = {
  teamName: string;
  children: ReactNode;
};

/**
 * Scopes shell / remote UI to a team for OTLP attribution.
 * Sets OTel context during render and a UI fallback for async handlers.
 */
export function MicrofrontendBoundary({
  teamName,
  children,
}: MicrofrontendBoundaryProps) {
  useEffect(() => {
    pushActiveUiTeam(teamName);
    return () => popActiveUiTeam(teamName);
  }, [teamName]);

  return (
    <div data-mfe-team={teamName} style={{ display: "contents" }}>
      {runWithTeam(teamName, () => children)}
    </div>
  );
}