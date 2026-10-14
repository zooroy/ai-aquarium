import { expect,it } from 'vitest';
import { beginStroke,clearDrawing,createDrawing,endStroke,extendStroke,getDrawing,undo } from '../../src/drawing/drawing-model';
import { CUSTOM_FISH_PARAMS as p } from '../../src/config/params';
import { PALETTE } from '../../src/config/palette';
const draw = (state: ReturnType<typeof createDrawing>,color:number|'erase'=PALETTE.brush[0]) =>
  endStroke(extendStroke(beginStroke(state,color,'medium',{u:.1,v:.2}),{u:.8,v:.7}));
it('starts with base only, preserves brush/eraser and undoes two out of three strokes',()=>{
  const initial=createDrawing();
  expect(getDrawing(initial)).toEqual({template:'default',base:PALETTE.customFishBase,strokes:[]});
  let state=draw(draw(draw(initial),PALETTE.brush[1]),'erase');
  expect(getDrawing(state).strokes.map(s=>s.color)).toEqual([PALETTE.brush[0],PALETTE.brush[1],'erase']);
  expect(getDrawing(state).strokes[0].size).toBe('medium');
  state=undo(undo(state));
  expect(getDrawing(state).strokes).toHaveLength(1);
  expect(initial.history).toHaveLength(0);
});
it.each(['small','medium','large'] as const)('interpolates %s brush gaps to at most its pixel radius',size=>{
  let state=beginStroke(createDrawing(),PALETTE.brush[0],size,{u:0,v:0});
  state=extendStroke(state,{u:1,v:1});
  const points=getDrawing(state).strokes[0].points;
  expect(points.length).toBeGreaterThan(2);
  expect(points.at(-1)).toEqual({u:1,v:1});
  for(let i=1;i<points.length;i++) expect(Math.hypot((points[i].u-points[i-1].u)*512,(points[i].v-points[i-1].v)*256)).toBeLessThanOrEqual(p.brushSizes[size]/2+1e-9);
});
it('merges oldest strokes in order, retains 50 undo actions, and can undo clear across merged content',()=>{
  let state=createDrawing();
  for(let i=0;i<55;i++) state=draw(state,i);
  expect(state.mergedStrokes.map(s=>s.color)).toEqual([0,1,2,3,4]);
  expect(state.history).toHaveLength(50);
  expect(getDrawing(state).strokes).toHaveLength(55);
  const before=getDrawing(state);
  state=clearDrawing(state);
  expect(getDrawing(state).strokes).toEqual([]);
  state=undo(state);
  expect(getDrawing(state)).toEqual(before);
  for(let i=0;i<50;i++) state=undo(state);
  expect(getDrawing(state).strokes.map(s=>s.color)).toEqual([0,1,2,3,4,5]);
});
it('folds an expired clear into the base without resurrecting earlier strokes',()=>{
  let state=clearDrawing(draw(createDrawing()));
  for(let i=0;i<51;i++) state=draw(state,i);
  expect(state.mergedStrokes.map(s=>s.color)).toEqual([0]);
  expect(getDrawing(state).strokes).toHaveLength(51);
  for(let i=0;i<50;i++) state=undo(state);
  expect(getDrawing(state).strokes.map(s=>s.color)).toEqual([0]);
});
it('supports a single-point stroke and detached drawing snapshots',()=>{
  const state=endStroke(beginStroke(createDrawing(),'erase','small',{u:.5,v:.5}));
  const snapshot=getDrawing(state);snapshot.strokes[0].points[0].u=1;
  expect(getDrawing(state).strokes[0].points).toEqual([{u:.5,v:.5}]);
  expect(getDrawing(undo(state)).strokes).toEqual([]);
  expect(endStroke(state)).toBe(state);
});
