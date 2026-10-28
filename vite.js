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
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const packageRoot = path.dirname(fileURLToPath(import.meta.url));
const sourceRoot = path.join(packageRoot, 'src');

export const BASE_URL_PLACEHOLDER = '{{BASE_PATH}}';

const LICENSE_HEADER = `This source file is part of the Swift.org open source project

Copyright (c) 2021 Apple Inc. and the Swift project authors
Licensed under Apache License v2.0 with Runtime Library Exception

See https://swift.org/LICENSE.txt for license information
See https://swift.org/CONTRIBUTORS.txt for Swift project authors`;
const DISTRIBUTION_LICENSE_HEADER = [
  '/*!',
  ...LICENSE_HEADER.split('\n').map(line => ` *${line ? ` ${line}` : ''}`),
  ' */',
].join('\n');
const proxyPathPattern = /^\/(data|downloads|images|videos|index|theme-settings\.json)(?:\/|$)/;
const builtinHighlightLanguages = [
  'bash',
  'c',
  'cpp',
  'css',
  'diff',
  'http',
  'java',
  'javascript',
  'json',
  'llvm',
  'markdown',
  'objectivec',
  'perl',
  'php',
  'pkl',
  'python',
  'ruby',
  'scss',
  'shell',
  'swift',
  'typescript',
  'xml',
  'yaml',
];
const customHighlightLanguages = new Set(['markdown', 'pkl', 'swift']);

function resolveFile(candidate) {
  return [
    candidate,
    `${candidate}.js`,
    `${candidate}.vue`,
    `${candidate}.json`,
    `${candidate}.scss`,
    path.join(candidate, 'index.js'),
  ].find(file => fs.existsSync(file));
}

export function themeFallback({ themeRoots } = {}) {
  let roots;
  const resolveThemeFile = (id) => {
    if (!id.startsWith('theme/')) return null;
    const relativePath = id.slice('theme/'.length);
    return roots
      .map(root => resolveFile(path.join(root, relativePath)))
      .find(Boolean) || null;
  };

  return {
    name: 'swift-docc-render-theme-fallback',
    enforce: 'pre',
    config: () => ({
      css: {
        preprocessorOptions: {
          scss: {
            importers: [{
              findFileUrl(url) {
                const file = resolveThemeFile(url);
                return file ? pathToFileURL(file) : null;
              },
            }],
          },
        },
      },
    }),
    configResolved(config) {
      // order the theme fallback from custom theme to swift-docc-render/src
      roots = [...(themeRoots ?? [path.join(config.root, 'src/theme')]), sourceRoot];
    },
    resolveId: resolveThemeFile,
  };
}

function contentType(file) {
  return {
    '.css': 'text/css',
    '.gif': 'image/gif',
    '.html': 'text/html',
    '.ico': 'image/x-icon',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.mp4': 'video/mp4',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.webm': 'video/webm',
  }[path.extname(file).toLowerCase()] || 'application/octet-stream';
}

export function localDocCArchive(archivePath) {
  return {
    name: 'swift-docc-render-local-archive',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const url = new URL(request.url, 'http://localhost');
        if (!proxyPathPattern.test(url.pathname)) {
          next();
          return;
        }

        let archiveRelativePath = decodeURIComponent(url.pathname);
        if (url.pathname.startsWith('/data/diffs/') && url.searchParams.has('changes')) {
          const extension = path.extname(archiveRelativePath);
          archiveRelativePath = [
            archiveRelativePath.slice(0, -extension.length),
            '-',
            url.searchParams.get('changes'),
            extension,
          ].join('');
        }

        const file = path.resolve(archivePath, `.${archiveRelativePath}`);
        const archiveRoot = `${path.resolve(archivePath)}${path.sep}`;
        if (!file.startsWith(archiveRoot) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
          Reflect.set(response, 'statusCode', 404);
          response.end();
          return;
        }

        Reflect.set(response, 'statusCode', 200);
        response.setHeader('Content-Type', contentType(file));
        fs.createReadStream(file).pipe(response);
      });
    },
  };
}

export function indexTemplate({ title }) {
  let isBuild;
  const noScript = fs.readFileSync(
    path.join(sourceRoot, 'assets/global-elements/noscript.html'),
    'utf8',
  );

  return {
    name: 'swift-docc-render-index-template',
    configResolved(config) {
      isBuild = config.command === 'build';
    },
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        const baseUrl = isBuild ? `${BASE_URL_PLACEHOLDER}/` : '/';
        return html
          .replaceAll('__SWIFT_DOCC_RENDER_BASE_URL__', baseUrl)
          .replace('__SWIFT_DOCC_RENDER_TITLE__', title)
          .replace('<!-- SWIFT_DOCC_RENDER_NOSCRIPT -->', noScript);
      },
    },
  };
}

export function highlightLanguageLoaders(additionalLanguages) {
  const virtualModuleId = 'virtual:swift-docc-highlight-languages';
  const resolvedVirtualModuleId = `\0${virtualModuleId}`;
  const languages = [...new Set([
    ...builtinHighlightLanguages,
    ...additionalLanguages
      .split(',')
      .map(language => language.trim())
      .filter(language => /^[a-z0-9-]+$/.test(language)),
  ])];

  return {
    name: 'swift-docc-render-highlight-languages',
    resolveId(id) {
      return id === virtualModuleId ? resolvedVirtualModuleId : null;
    },
    load(id) {
      if (id !== resolvedVirtualModuleId) return null;
      const loaders = languages.map((language) => {
        const moduleId = customHighlightLanguages.has(language)
          ? path.join(sourceRoot, `utils/custom-highlight-lang/${language}.js`)
          : `highlight.js/lib/languages/${language}`;
        return `${JSON.stringify(language)}: () => import(${JSON.stringify(moduleId)})`;
      });
      return `export default {${loaders.join(',')}};`;
    },
  };
}

export function distributionLicenseHeaders() {
  let outputRoot;
  const normalizeHeader = contents => (
    `${DISTRIBUTION_LICENSE_HEADER}\n${
      contents.replace(`${DISTRIBUTION_LICENSE_HEADER}\n`, '')
    }`
  );

  return {
    name: 'swift-docc-render-license-headers',
    apply: 'build',
    enforce: 'post',
    configResolved(config) {
      outputRoot = path.resolve(config.root, config.build.outDir);
    },
    generateBundle(_options, bundle) {
      // Add headers while the generated chunks and assets are still in the bundler pipeline.
      Object.values(bundle).forEach((output) => {
        if (output.type === 'chunk') {
          // eslint-disable-next-line no-param-reassign
          output.code = normalizeHeader(output.code);
        } else if (output.fileName.endsWith('.css')) {
          // eslint-disable-next-line no-param-reassign
          output.source = normalizeHeader(output.source);
        }
      });
    },
    closeBundle() {
      // Reapply the header to the final files in case later output processing rewrote them.
      ['css', 'js'].forEach((directory) => {
        const outputDirectory = path.join(outputRoot, directory);
        if (!fs.existsSync(outputDirectory)) return;
        fs.readdirSync(outputDirectory).forEach((fileName) => {
          const outputFile = path.join(outputDirectory, fileName);
          const contents = fs.readFileSync(outputFile, 'utf8');
          fs.writeFileSync(outputFile, normalizeHeader(contents));
        });
      });
    },
  };
}

function baseConfiguration({ buildTarget }) {
  return {
    name: 'swift-docc-render-base-config',
    config(_config, { command }) {
      const isBuild = command === 'build';
      return {
        base: isBuild ? `/${BASE_URL_PLACEHOLDER}/` : '/',
        experimental: {
          renderBuiltUrl(filename, { hostType }) {
            if (hostType === 'js') {
              return { runtime: `new URL(${JSON.stringify(filename)}, document.baseURI).href` };
            }
            return undefined;
          },
        },
        resolve: {
          alias: {
            'docc-render': sourceRoot,
          },
        },
        css: {
          preprocessorOptions: {
            scss: {
              additionalData: `$build-target: '${buildTarget}'; $is-target-ide: $build-target == 'ide';`,
              silenceDeprecations: [
                'color-functions',
                'global-builtin',
                'if-function',
                'import',
                'slash-div',
              ],
            },
          },
        },
        build: {
          sourcemap: false,
          rolldownOptions: {
            output: {
              assetFileNames: ({ names = [] }) => (
                names.some(name => name.endsWith('.css'))
                  ? 'css/[name].[hash][extname]'
                  : 'assets/[name].[hash][extname]'
              ),
              chunkFileNames: 'js/[name].[hash].js',
              entryFileNames: 'js/[name].[hash].js',
            },
          },
        },
      };
    },
  };
}

export default function swiftDocCRender({
  additionalHighlightLanguages = '',
  buildTarget = 'default',
  themeRoots,
  title = 'Documentation',
} = {}) {
  return [
    baseConfiguration({ buildTarget }),
    themeFallback({ themeRoots }),
    highlightLanguageLoaders(additionalHighlightLanguages),
    distributionLicenseHeaders(),
    indexTemplate({ title }),
  ];
}
