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
import { localDocCArchive, themeFallback } from '../../vite.config';

describe('theme fallback', () => {
  let themeRoot;

  beforeEach(() => {
    themeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'swift-docc-render-theme-'));
  });

  afterEach(() => {
    fs.rmSync(themeRoot, { force: true, recursive: true });
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
