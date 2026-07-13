export {};

declare global {
  interface Window {
    /**
     * Next.js includes both DOM and Node timer overloads. Keep explicit window timers
     * compatible with refs that use ReturnType<typeof window.setTimeout>.
     */
    setTimeout(handler: TimerHandler, timeout?: number, ...arguments: unknown[]): NodeJS.Timeout;
  }
}
