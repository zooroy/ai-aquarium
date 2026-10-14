export type Point = [number,number,number];
export interface Model {name:string;vertices:Point[];triangles:Point[][]}
export interface Rest {name:string;hand:'left'|'right';joints:Point[]}
export interface Processed {name:string;faces:{triangle:Point[];source:number}[];fallback:number[];rings:{origin:Point;normal:Point;vertices:Point[]}[][]}
export function parseGlb(bytes:Uint8Array):Model[];
export function deriveRest(models:Model[]):Rest[];
export function preprocess(model:Model,rest:Rest):Processed;
export function splitTriangle(triangle:Point[],origin:Point,normal:Point):Point[][];
export function fingerOwner(point:Point,joints:readonly (readonly number[])[]):number;
export function encodeGlb(models:Processed[]):Uint8Array;
