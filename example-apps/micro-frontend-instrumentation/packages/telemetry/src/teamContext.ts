import { context, createContextKey, type Context } from "@opentelemetry/api";

export const TEAM_ATTRIBUTE_KEY = "team.name";

export const TEAM_NAMES = {
  platformShell: "platform-shell",
  identity: "identity",
  gallery: "gallery",
  mediaDetail: "media-detail",
} as const;

const TEAM_CONTEXT_KEY = createContextKey("mfe.telemetry.team.name");
const DEFAULT_TEAM = TEAM_NAMES.platformShell;

/** Fallback when OTel context is lost across async / DOM listeners (innermost boundary wins). */
const activeUiTeamStack: string[] = [];

export function pushActiveUiTeam(teamName: string): void {
  activeUiTeamStack.push(teamName);
}

export function popActiveUiTeam(teamName: string): void {
  const index = activeUiTeamStack.lastIndexOf(teamName);
  if (index >= 0) {
    activeUiTeamStack.splice(index, 1);
  }
}

export function runWithTeam<T>(teamName: string, fn: () => T): T {
  const active = context.active();
  return context.with(active.setValue(TEAM_CONTEXT_KEY, teamName), fn);
}

export function getActiveTeamName(activeContext?: Context): string {
  const ctx = activeContext ?? context.active();
  const team = ctx.getValue(TEAM_CONTEXT_KEY);
  if (typeof team === "string" && team.length > 0) return team;
  const uiTeam = activeUiTeamStack[activeUiTeamStack.length - 1];
  if (uiTeam) return uiTeam;
  return DEFAULT_TEAM;
}