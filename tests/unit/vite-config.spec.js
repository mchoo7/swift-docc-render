/**
 * This source file is part of the Swift.org open source project
 *
 * Copyright (c) 2026 Apple Inc. and the Swift project authors
 * Licensed under Apache License v2.0 with Runtime Library Exception
 *
 * See https://swift.org/LICENSE.txt for license information
 * See https://swift.org/CONTRIBUTORS.txt for Swift project authors
*/

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import swiftDocCRender, {
  BASE_URL_PLACEHOLDER,
  localDocCArchive,
  themeFallback,
} from '../../vite';

const sourceRoot = path.resolve(import.meta.dirname, '../../src');

describe('shared Vite plugins', () => {
  it('provides the base configuration for consuming applications', () => {
    const plugins = swiftDocCRender({ buildTarget: 'ide', title: 'Custom Documentation' });
    const baseConfig = plugins.find(({ name }) => name === 'swift-docc-render-base-config')
      .config({}, { command: 'build' });
    const indexPlugin = plugins.find(({ name }) => name === 'swift-docc-render-index-template');
    indexPlugin.configResolved({ command: 'build' });

    expect(baseConfig.base).toBe(`/${BASE_URL_PLACEHOLDER}/`);
    expect(baseConfig.resolve.alias['docc-render']).toBe(sourceRoot);
    expect(baseConfig.css.preprocessorOptions.scss.additionalData).toContain("$build-target: 'ide'");
    expect(indexPlugin.transformIndexHtml.handler('__SWIFT_DOCC_RENDER_TITLE__'))
      .toBe('Custom Documentation');
  });
});

describe('theme fallback', () => {
  let themeRoot;

  beforeEach(() => {
    themeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'swift-docc-render-theme-'));
  });

  afterEach(() => {
    fs.rmSync(themeRoot, { force: true, recursive: true });
  });

  it('uses the consuming application theme directory by default', () => {
    const component = path.join(themeRoot, 'src', 'theme', 'components', 'Custom.vue');
    fs.mkdirSync(path.dirname(component), { recursive: true });
    fs.writeFileSync(component, '<template />');
    const plugin = themeFallback();
    plugin.configResolved({ root: themeRoot });

    expect(plugin.resolveId('theme/components/Custom.vue')).toBe(component);
  });

  it('prefers files from a consuming application theme', () => {
    const component = path.join(themeRoot, 'components', 'Custom.vue');
    fs.mkdirSync(path.dirname(component), { recursive: true });
    fs.writeFileSync(component, '<template />');
    const plugin = themeFallback({ themeRoots: [themeRoot] });
    plugin.configResolved({ root: '/consumer' });

    expect(plugin.resolveId('theme/components/Custom.vue')).toBe(component);
  });

  it('falls back to swift-docc-render source files', () => {
    const plugin = themeFallback({ themeRoots: [themeRoot] });
    plugin.configResolved({ root: '/consumer' });

    expect(plugin.resolveId('theme/components/Icons/CloseIcon.vue'))
      .toMatch(/swift-docc-render\/src\/components\/Icons\/CloseIcon\.vue$/);
  });
});

describe('local DocC archive middleware', () => {
  it('returns a 404 for missing archive resources', () => {
    let middleware;
    localDocCArchive('/missing/archive').configureServer({
      middlewares: {
        use: vi.fn((handler) => {
          middleware = handler;
        }),
      },
    });
    const response = { end: vi.fn() };
    const next = vi.fn();

    middleware({ url: '/data/documentation/missing.json' }, response, next);

    expect(response.statusCode).toBe(404);
    expect(response.end).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();
  });
});
