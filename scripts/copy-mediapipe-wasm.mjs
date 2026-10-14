import { cp, rm } from 'node:fs/promises';
const source = new URL('../node_modules/@mediapipe/tasks-vision/wasm/', import.meta.url);
const destination = new URL('../public/mediapipe/wasm/', import.meta.url);
await rm(destination, { recursive: true, force: true });
await cp(source, destination, { recursive: true });
