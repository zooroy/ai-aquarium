import { Color, InstancedMesh, Matrix4, Scene, Vector3 } from 'three';
import { expect, it } from 'vitest';
import { FishRenderer } from '../../../src/render/fish/fish-renderer';
import { createSchool } from '../../../src/simulation/fish-state';
import { createRandom } from '../../../src/core/random';
import { FISH_PARAMS, FISH_RENDER_PARAMS } from '../../../src/config/params';
import { PALETTE } from '../../../src/config/palette';
const school = (count: number) => createSchool(count, { min: { x: -2, y: -2, z: -2 }, max: { x: 2, y: 2, z: 2 } }, createRandom(42));
it('groups variants, applies colors and synchronizes transforms, phase and speed frequency', () => {
  const scene = new Scene(), renderer = new FishRenderer(scene, 1);
  const fish = school(6);
  fish[0].velocity.set(FISH_PARAMS.minSpeed, 0, 0);
  fish[3].velocity.set(FISH_PARAMS.maxSpeed, 0, 0);
  renderer.sync(fish, 1);
  expect(scene.children).toHaveLength(PALETTE.fish.length);
  scene.children.forEach((child, variant) => {
    const mesh = child as InstancedMesh;
    expect(mesh.count).toBe(2);
    const matching = fish.filter((item) => item.variant === variant);
    matching.forEach((item, index) => {
      const matrix = new Matrix4(); mesh.getMatrixAt(index, matrix);
      expect(new Vector3().setFromMatrixPosition(matrix).distanceTo(item.position)).toBeLessThan(1e-6);
      expect(new Vector3(1, 0, 0).transformDirection(matrix).distanceTo(item.forward)).toBeLessThan(1e-6);
      expect(new Vector3().setFromMatrixScale(matrix).x).toBeCloseTo(item.scale);
      expect(mesh.geometry.getAttribute('aSwimPhase').getX(index)).toBeCloseTo(item.phase);
      expect(mesh.geometry.getAttribute('aSwimAmp').getX(index)).toBe(1);
    });
    const colors = mesh.geometry.getAttribute('color');
    const expected = [PALETTE.fish[variant].body, PALETTE.fish[variant].fins, PALETTE.fish[variant].belly].map((hex) => new Color(hex));
    for (const color of expected) expect(Array.from({ length: colors.count }, (_, i) => new Vector3(colors.getX(i), colors.getY(i), colors.getZ(i)).distanceTo(new Vector3(color.r, color.g, color.b))).some((distance) => distance < 1e-6)).toBe(true);
  });
  const first = scene.children[0] as InstancedMesh;
  expect(first.geometry.getAttribute('aSwimFreq').getX(0)).toBe(FISH_RENDER_PARAMS.minFreq);
  expect(first.geometry.getAttribute('aSwimFreq').getX(1)).toBe(FISH_RENDER_PARAMS.maxFreq);
  renderer.sync([], 2);
  expect(scene.children.every((child) => (child as InstancedMesh).count === 0)).toBe(true);
  renderer.dispose(); expect(scene.children).toHaveLength(0);
});
it('stays finite and continuous across nearly vertical headings', () => {
  const scene = new Scene(), renderer = new FishRenderer(scene);
  const fish = school(1); let previous: Vector3 | undefined;
  for (let i = 0; i <= 20; i++) {
    fish[0].forward.set((10 - i) * 0.0001, 1, 0).normalize();
    renderer.sync(fish, i / 60);
    const matrix = new Matrix4(); (scene.children[0] as InstancedMesh).getMatrixAt(0, matrix);
    expect(matrix.elements.every(Number.isFinite)).toBe(true);
    const up = new Vector3(0, 1, 0).transformDirection(matrix);
    if (previous) expect(previous.angleTo(up)).toBeLessThan(0.01);
    previous = up;
    expect(new Vector3(1, 0, 0).transformDirection(matrix).distanceTo(fish[0].forward)).toBeLessThan(1e-6);
  }
  renderer.dispose();
});
