// This project does not install @types/node; tests use only the binary file reader.
declare module 'node:fs' {
  export function readFileSync(path: string): Uint8Array;
}
