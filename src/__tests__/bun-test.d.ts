declare module 'bun:test' {
  export const describe: (name: string, fn: () => void) => void;
  export const it: (name: string, fn: () => void | Promise<void>) => void;
  export const test: (name: string, fn: () => void | Promise<void>) => void;
  export const beforeEach: (fn: () => void | Promise<void>) => void;
  export const afterEach: (fn: () => void | Promise<void>) => void;
  export const expect: <T = unknown>(actual: T) => {
    toBe(expected: unknown): void;
    toEqual(expected: unknown): void;
    toBeDefined(): void;
    toBeUndefined(): void;
    toBeInstanceOf(expected: unknown): void;
    toHaveLength(expected: number): void;
    toContain(expected: unknown): void;
    toBeLessThan(expected: number): void;
    resolves: {
      toBe(expected: unknown): Promise<void>;
      toEqual(expected: unknown): Promise<void>;
    };
    rejects: {
      toThrow(expected?: string | RegExp): Promise<void>;
    };
  };
}
