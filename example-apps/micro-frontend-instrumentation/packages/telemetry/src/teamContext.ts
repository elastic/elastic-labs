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

export function runWithTeam<T>(teamName: string, fn: () => T): T {
  const active = context.active();
  return context.with(active.setValue(TEAM_CONTEXT_KEY, teamName), fn);
}

export function getActiveTeamName(activeContext?: Context): string {
  const ctx = activeContext ?? context.active();
  const team = ctx.getValue(TEAM_CONTEXT_KEY);
  return typeof team === "string" && team.length > 0 ? team : DEFAULT_TEAM;
}