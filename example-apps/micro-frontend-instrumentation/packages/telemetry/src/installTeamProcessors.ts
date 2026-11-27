import { logs, trace } from "@opentelemetry/api";

import { TeamLogRecordProcessor, TeamSpanProcessor } from "./teamProcessors";

const INSTALLED_KEY = "__MFE_TEAM_PROCESSORS_INSTALLED__";

function unwrapProvider<T>(provider: T): T {
  const wrapped = provider as T & { _delegate?: T };
  return wrapped._delegate ?? provider;
}

function spliceBeforeExportProcessor<T>(
  list: T[],
  processor: T
): boolean {
  if (list.some((p) => p === processor)) {
    return false;
  }
  if (list.length === 0) {
    list.push(processor);
    return true;
  }
  const insertAt = Math.max(0, list.length - 1);
  list.splice(insertAt, 0, processor);
  return true;
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

  const tracerProvider = unwrapProvider(trace.getTracerProvider());
  const spanList = spanProcessorList(tracerProvider);
  if (!spanList) {
    throw new Error(
      "TeamSpanProcessor: could not find tracer provider span processor list"
    );
  }
  spliceBeforeExportProcessor(spanList, TeamSpanProcessor);

  const loggerProvider = unwrapProvider(logs.getLoggerProvider());
  const logList = logProcessorList(loggerProvider);
  if (!logList) {
    throw new Error(
      "TeamLogRecordProcessor: could not find logger provider processor list"
    );
  }
  spliceBeforeExportProcessor(logList, TeamLogRecordProcessor);

  (globalThis as Record<string, unknown>)[INSTALLED_KEY] = true;
  return true;
}