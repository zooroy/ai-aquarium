import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const eslint = new ESLint({ overrideConfigFile: 'eslint.config.js' });

describe('project lint rules', () => {
  it.each(['src/simulation/x.ts', 'src/core/x.ts', 'src/ui/x.ts'])(
    'rejects Math.random in %s', async (filePath) => {
      const [result] = await eslint.lintText('Math.random();', { filePath });
      expect(result.messages).toEqual(expect.arrayContaining([
        expect.objectContaining({ ruleId: 'no-restricted-properties', severity: 2, line: 1 }),
      ]));
    },
  );

  it('allows Math.random in the seeded PRNG module', async () => {
    const [result] = await eslint.lintText('Math.random();', { filePath: 'src/core/random.ts' });
    expect(result.messages).toEqual([]);
  });

  describe.each(['src/simulation/x.ts', 'src/core/x.ts',
    'src/input/types.ts', 'src/input/input-manager.ts'])('%s', (filePath) => {
    it.each(['Mesh', 'MeshBasicMaterial', 'WebGLRenderer'])(
      'rejects rendering class %s', async (name) => {
        const [result] = await eslint.lintText(
          `import { ${name} } from 'three'; export { ${name} };`, { filePath },
        );
        expect(result.messages).toEqual(expect.arrayContaining([
          expect.objectContaining({ ruleId: 'no-restricted-imports', severity: 2, line: 1 }),
        ]));
      },
    );

    it.each(['Vector3', 'Quaternion'])('allows math class %s', async (name) => {
      const [result] = await eslint.lintText(
        `import { ${name} } from 'three'; export { ${name} };`, { filePath },
      );
      expect(result.messages).toEqual([]);
    });
  });

  it('allows Mesh in render code', async () => {
    const [result] = await eslint.lintText("import { Mesh } from 'three'; export { Mesh };", {
      filePath: 'src/render/x.ts',
    });
    expect(result.messages).toEqual([]);
  });

  it.each(['src/ui/x.ts', 'tests/x.test.ts'])('rejects explicit any in %s', async (filePath) => {
    const [result] = await eslint.lintText('export const a: any = 1;', { filePath });
    expect(result.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: '@typescript-eslint/no-explicit-any', severity: 2, line: 1 }),
    ]));
  });
});
