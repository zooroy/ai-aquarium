import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import { defineConfig } from 'eslint/config';

export default defineConfig([
  {
    ignores: ['dist/**', 'dist-e2e/**', 'public/**', 'node_modules/**',
      'playwright-report/**', 'test-results/**', 'acceptance/**'],
  },
  {
    files: ['src/**/*.ts', 'tests/**/*.ts', 'scripts/**/*.mjs'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
    },
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: { URL: 'readonly', process: 'readonly', console: 'readonly' } },
  },
  {
    files: ['src/**/*.ts'],
    ignores: ['src/core/random.ts'],
    rules: {
      'no-restricted-properties': ['error', {
        object: 'Math', property: 'random', message: '請用 src/core/random.ts 的帶種子 PRNG',
      }],
    },
  },
  {
    files: ['src/simulation/**/*.ts', 'src/core/**/*.ts',
      'src/input/types.ts', 'src/input/input-manager.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['three'],
          importNamePattern: '^(WebGL\\w*|\\w*Renderer|Scene|Object3D|Group|Mesh|InstancedMesh|Points|Line\\w*|Sprite|\\w*Material|\\w*Geometry|\\w*Texture|\\w*Camera|\\w*Light)$',
          message: '純邏輯目錄不可使用 Three.js 渲染類別',
        }],
      }],
    },
  },
]);
