import fs from 'node:fs';
import path from 'node:path';

import { CLIENT_STATIC_PATH } from '../constants/paths';

interface ManifestChunk {
  file: string;
  src?: string;
  isEntry?: boolean;
  imports?: string[];
  css?: string[];
  dynamicImports?: string[];
}

type Manifest = Record<string, ManifestChunk>;

let manifestCache: Manifest | null = null;

function loadManifest(): Manifest {
  if (manifestCache) return manifestCache;

  const manifestPath = path.resolve(CLIENT_STATIC_PATH, '.vite/manifest.json');
  const raw = fs.readFileSync(manifestPath, 'utf-8');
  manifestCache = JSON.parse(raw) as Manifest;
  return manifestCache;
}

export function getEntryAssets(entryName: string): { scripts: string[]; styles: string[] } {
  const manifest = loadManifest();
  const scripts: string[] = [];
  const styles: string[] = [];
  const visited = new Set<string>();

  function collect(key: string) {
    if (visited.has(key)) return;
    visited.add(key);

    const chunk = manifest[key];
    if (!chunk) return;

    if (chunk.css) {
      for (const css of chunk.css) {
        styles.push('/' + css);
      }
    }

    if (chunk.imports) {
      for (const imp of chunk.imports) {
        collect(imp);
      }
    }

    scripts.push('/' + chunk.file);
  }

  collect(entryName);
  return { scripts, styles };
}
