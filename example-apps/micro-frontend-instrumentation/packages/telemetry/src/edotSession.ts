/** Return value of `startBrowserSdk` from the shell EDOT vendor script. */
export type EdotBrowserSdk = {
  endSession?: () => void;
  getSession?: () => unknown;
  observe?: (event: string, handler: (...args: unknown[]) => void) => () => void;
  shutdown?: () => Promise<void>;
};

declare global {
  // eslint-disable-next-line no-var
  var __EDOT_SDK__: EdotBrowserSdk | undefined;
}

/** Ends the current EDOT browser session (shell-only init). No-op when EDOT is not loaded. */
export function endBrowserEdotSession(): void {
  globalThis.__EDOT_SDK__?.endSession?.();
}