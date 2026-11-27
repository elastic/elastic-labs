import { logs, trace } from "@opentelemetry/api";

import { TeamLogRecordProcessor, TeamSpanProcessor } from "./teamProcessors";

const INSTALLED_KEY = "__MFE_TEAM_PROCESSORS_INSTALLED__";

function unwrapProvider<T>(provider: T): T {
  const wrapped = provider as T & { _delegate?: T };
  return wrapped._delegate ?? provider;
}

function unshiftProcessor<T>(
  list: T[] | undefined,
  processor: T,
  label: string
): void {
  if (!list) {
    throw new Error(`${label}: could not find provider processor list`);
  }
  if (list.includes(processor)) {
    return;
  }
  list.unshift(processor);
}

function spanProcessorList(tracerProvider: unknown): unknown[] | undefined {
  const tp = tracerProvider as {
    _activeSpanProcessor?: {
      _spanProcessors?: unknown[];
      processors?: unknown[];
    };
  };
  const asp = tp?._activeSpanProcessor;
  return asp?._spanProcessors ?? asp?.processors;
}

function logProcessorList(loggerProvider: unknown): unknown[] | undefined {
  const lp = loggerProvider as {
    _sharedState?: { registeredLogRecordProcessors?: unknown[] };
  };
  return lp?._sharedState?.registeredLogRecordProcessors;
}

export function installTeamProcessors(): boolean {
  if ((globalThis as Record<string, unknown>)[INSTALLED_KEY]) {
    return false;
  }

  unshiftProcessor(
    spanProcessorList(unwrapProvider(trace.getTracerProvider())),
    TeamSpanProcessor,
    "TeamSpanProcessor"
  );
  unshiftProcessor(
    logProcessorList(unwrapProvider(logs.getLoggerProvider())),
    TeamLogRecordProcessor,
    "TeamLogRecordProcessor"
  );

  (globalThis as Record<string, unknown>)[INSTALLED_KEY] = true;
  return true;
}