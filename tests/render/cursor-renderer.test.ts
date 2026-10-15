import { IcosahedronGeometry, Mesh, MeshLambertMaterial, PerspectiveCamera, Scene } from 'three';
import { expect, it, vi } from 'vitest';
import { updateCursorStates } from '../../src/render/cursor-state';
import { CursorRenderer } from '../../src/render/cursor-renderer';
import { CURSOR_PARAMS, GRAB_PARAMS } from '../../src/config/params';
import type { Pointer } from '../../src/input/types';
const pointer: Pointer = { id: 'touch-1', x: 0.25, y: 0.25, fist: false, pressed: true, source: 'touch' };
it('adds/removes by id without mutating snapshots, interpolates and reverses smoothly', () => {
  const state = updateCursorStates([], { pointers: [pointer] }, 0.05);
  expect(state[0].activation).toBeCloseTo(0.5);
  const held = updateCursorStates(state, { pointers: [pointer] }, 0.05);
  expect(held[0].activation).toBe(1);
  expect(state[0].activation).toBe(0.5);
  const released = updateCursorStates(held, { pointers: [{ ...pointer, fist: false, pressed: false }] }, 0.05);
  expect(released[0].activation).toBeCloseTo(0.5);
  expect(updateCursorStates(released, { pointers: [pointer] }, 0.025)[0].activation).toBeCloseTo(0.75);
  expect(updateCursorStates(released, { pointers: [{ ...pointer, fist: false, pressed: false }] }, 1)[0].activation).toBe(0);
  const multi = updateCursorStates(state, { pointers: [pointer, { ...pointer, id: 'touch-2' }] }, 0);
  expect(multi).toHaveLength(2);
  expect(updateCursorStates(multi, { pointers: [{ ...pointer, id: 'touch-2' }] }, 0)[0].id).toBe('touch-2');
  expect(updateCursorStates(multi, { pointers: [] }, 0)).toEqual([]);
});
it('projects to the shared hold plane, animates pressed feedback, and disposes disappeared cursors', () => {
  const scene = new Scene(), camera = new PerspectiveCamera(45, 16 / 9, 0.1, 100);
  camera.position.set(0, 0, 14); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  const renderer = new CursorRenderer(scene, camera);
  renderer.sync({ pointers: [pointer, { ...pointer, id: 'touch-2' }] }, 0.1);
  const mesh = scene.children[0] as Mesh;
  expect(mesh.position.z).toBeCloseTo(GRAB_PARAMS.holdZ);
  const projected = mesh.position.clone().project(camera);
  expect((projected.x + 1) / 2).toBeCloseTo(pointer.x);
  expect((1 - projected.y) / 2).toBeCloseTo(pointer.y);
  expect(mesh.scale.x).toBeCloseTo(CURSOR_PARAMS.pressedScale);
  const geometryDispose = vi.spyOn(mesh.geometry, 'dispose');
  const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  const materialDispose = vi.spyOn(material, 'dispose');
  renderer.sync({ pointers: [{ ...pointer, id: 'touch-2', fist: false, pressed: false }] }, 0.1);
  expect(scene.children).toHaveLength(1);
  expect(geometryDispose).toHaveBeenCalledOnce(); expect(materialDispose).toHaveBeenCalledOnce();
  expect(scene.children[0].scale.x).toBe(1);
  camera.aspect = 9 / 16; camera.updateProjectionMatrix();
  renderer.sync({ pointers: [{ ...pointer, id: 'touch-2' }] }, 0);
  expect((scene.children[0].position.clone().project(camera).x + 1) / 2).toBeCloseTo(pointer.x);
  renderer.dispose(); expect(scene.children).toHaveLength(0);
});

it('never creates a polyhedron for hand pointers and removes an existing same-id mesh', () => {
  const scene=new Scene(), camera=new PerspectiveCamera(45,1,.1,100);
  camera.position.z=14; camera.updateMatrixWorld();
  const renderer=new CursorRenderer(scene,camera);
  renderer.sync({pointers:[{...pointer,source:'hand'}]},.1); expect(scene.children).toHaveLength(0);
  renderer.sync({pointers:[pointer]},.1); expect(scene.children).toHaveLength(1);
  renderer.sync({pointers:[{...pointer,source:'hand'}]},.1); expect(scene.children).toHaveLength(0);
  renderer.dispose();
});

it('leaves mouse pointers to the glove and only draws touch polyhedra', () => {
  const scene=new Scene(), camera=new PerspectiveCamera(45,1,.1,100);
  camera.position.z=14; camera.updateMatrixWorld();
  const renderer=new CursorRenderer(scene,camera);
  renderer.sync({pointers:[{...pointer,id:'mouse',source:'mouse'}]},.1); expect(scene.children).toHaveLength(0);
  renderer.sync({pointers:[{...pointer,id:'mouse',source:'mouse'},pointer]},.1); expect(scene.children).toHaveLength(1);
  expect(scene.children[0].name).toBe('cursor-touch-1');
  renderer.dispose();
});

it('animates fist activation over the transition time without touching pressed activation', () => {
  const fist = { ...pointer, pressed: false, fist: true };
  const half = updateCursorStates([], { pointers: [fist] }, CURSOR_PARAMS.transitionDuration / 2);
  expect(half[0].fistActivation).toBeCloseTo(.5); expect(half[0].activation).toBe(0);
  const full = updateCursorStates(half, { pointers: [fist] }, CURSOR_PARAMS.transitionDuration / 2);
  expect(full[0].fistActivation).toBeCloseTo(1);
  expect(updateCursorStates(full, { pointers: [{ ...fist, fist: false }] }, 1)[0].fistActivation).toBe(0);
});

it('draws the mouse as a polyhedron only when asked and gives the fist its own look', () => {
  const scene=new Scene(), camera=new PerspectiveCamera(45,1,.1,100);
  camera.position.z=14; camera.updateMatrixWorld();
  const renderer=new CursorRenderer(scene,camera);
  const mouse: Pointer = { ...pointer, id: 'mouse', source: 'mouse', pressed: false };
  renderer.sync({pointers:[mouse]},1,{mouseAsPolyhedron:false}); expect(scene.children).toHaveLength(0);
  renderer.sync({pointers:[mouse]},1,{mouseAsPolyhedron:true}); expect(scene.children).toHaveLength(1);
  const mesh=scene.children[0] as Mesh<IcosahedronGeometry,MeshLambertMaterial>;
  const look=()=>({scale:mesh.scale.x,color:mesh.material.color.getHex()});
  const idle=look();
  renderer.sync({pointers:[{...mouse,pressed:true}]},1,{mouseAsPolyhedron:true}); const pressed=look();
  renderer.sync({pointers:[{...mouse,fist:true}]},1,{mouseAsPolyhedron:true}); const fist=look();
  expect(fist.scale).toBeCloseTo(CURSOR_PARAMS.fistScale);
  expect(fist.scale).not.toBeCloseTo(idle.scale); expect(fist.scale).not.toBeCloseTo(pressed.scale);
  expect(fist.color).not.toBe(idle.color); expect(fist.color).not.toBe(pressed.color);
  renderer.sync({pointers:[mouse]},1,{mouseAsPolyhedron:false}); expect(scene.children).toHaveLength(0);
  renderer.dispose();
});
