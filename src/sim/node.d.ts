// Minimal Node typings for the simulator (keeps the repo free of @types/node).
declare const process: { argv: string[]; exit(code?: number): never; env: Record<string, string | undefined>; hrtime: { bigint(): bigint } };
declare module 'node:fs' {
  export function writeFileSync(path: string, data: string): void;
  export function mkdirSync(path: string, opts?: { recursive?: boolean }): void;
  export function readFileSync(path: string, enc: string): string;
  export function existsSync(path: string): boolean;
  export function statSync(path: string): { size: number };
}
declare module 'node:test' {
  export function test(name: string, fn: () => void | Promise<void>): void;
  export function describe(name: string, fn: () => void): void;
}
declare module 'node:assert/strict' {
  const assert: {
    (v: unknown, msg?: string): void;
    equal(a: unknown, b: unknown, msg?: string): void;
    notEqual(a: unknown, b: unknown, msg?: string): void;
    deepEqual(a: unknown, b: unknown, msg?: string): void;
    ok(v: unknown, msg?: string): void;
    throws(fn: () => unknown, msg?: unknown): void;
    fail(msg?: string): never;
  };
  export default assert;
}
