import type { Context } from "@opentelemetry/api";

function teamAttributes(ctx?: Context): Record<string, string> {
  const bridge = globalThis.__MFE_TELEMETRY__;
  const key = bridge?.teamAttributeKey ?? "team.name";
  const resolve = bridge?.getTeamName;
  const team =
    typeof resolve === "function" ? resolve(ctx) : "platform-shell";
  return team ? { [key]: team } : {};
}

export const TeamLogRecordProcessor = {
  onEmit(logRecord: { setAttributes?: (attrs: Record<string, string>) => void }, ctx: Context) {
    logRecord.setAttributes?.(teamAttributes(ctx));
  },
  forceFlush() {
    return Promise.resolve();
  },
  shutdown() {
    return Promise.resolve();
  },
};

export const TeamSpanProcessor = {
  onStart(
    span: { setAttributes?: (attrs: Record<string, string>) => void },
    parentContext: Context
  ) {
    span.setAttributes?.(teamAttributes(parentContext));
  },
  onEnd() {},
  forceFlush() {
    return Promise.resolve();
  },
  shutdown() {
    return Promise.resolve();
  },
};