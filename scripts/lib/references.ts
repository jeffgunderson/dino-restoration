import fs from 'node:fs';
import path from 'node:path';

const SUPPORTED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

export interface ImageMeta {
  filename: string;
  path: string;
  width: number;
  height: number;
  aspectRatio: number;
}

export interface ReferenceManifest {
  sideProfile?: string[];
  bodyWork?: string[];
  colorPatina?: string[];
}

export interface ReferenceLibrary {
  /** Every image file in base-images/ */
  all: ImageMeta[];
  /** Best side-profile shot(s) for composition lock */
  sideProfile: ImageMeta[];
  /** Body shell / in-progress restoration references */
  bodyWork: ImageMeta[];
  /** Complete-car color and patina references */
  colorPatina: ImageMeta[];
  manifestPath: string;
  manifestExists: boolean;
}

function readImageDimensions(filePath: string): { width: number; height: number } {
  const buffer = fs.readFileSync(filePath);

  // PNG
  if (buffer[0] === 0x89 && buffer[1] === 0x50) {
    return {
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
    };
  }

  // JPEG — scan for SOF marker
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset < buffer.length - 8) {
      if (buffer[offset] !== 0xff) {
        offset++;
        continue;
      }
      const marker = buffer[offset + 1];
      if (marker >= 0xc0 && marker <= 0xc3) {
        return {
          height: buffer.readUInt16BE(offset + 5),
          width: buffer.readUInt16BE(offset + 7),
        };
      }
      offset += 2 + buffer.readUInt16BE(offset + 2);
    }
  }

  // WEBP
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = buffer.toString('ascii', 12, 16);
    if (chunk === 'VP8 ') {
      return {
        width: buffer.readUInt16LE(26) & 0x3fff,
        height: buffer.readUInt16LE(28) & 0x3fff,
      };
    }
    if (chunk === 'VP8L') {
      const bits = buffer.readUInt32LE(21);
      return {
        width: (bits & 0x3fff) + 1,
        height: ((bits >> 14) & 0x3fff) + 1,
      };
    }
  }

  throw new Error(`Could not read dimensions: ${filePath}`);
}

function scanImages(baseImagesDir: string): ImageMeta[] {
  if (!fs.existsSync(baseImagesDir)) {
    throw new Error(`base-images folder not found: ${baseImagesDir}`);
  }

  const files = fs
    .readdirSync(baseImagesDir)
    .filter((name) => SUPPORTED_EXTENSIONS.has(path.extname(name).toLowerCase()))
    .sort();

  if (files.length === 0) {
    throw new Error(`No images found in ${baseImagesDir}`);
  }

  return files.map((filename) => {
    const filePath = path.join(baseImagesDir, filename);
    const { width, height } = readImageDimensions(filePath);
    return {
      filename,
      path: filePath,
      width,
      height,
      aspectRatio: width / height,
    };
  });
}

function loadManifest(manifestPath: string): ReferenceManifest | null {
  if (!fs.existsSync(manifestPath)) return null;
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as ReferenceManifest;
}

function resolveRole(
  all: ImageMeta[],
  assigned: string[] | undefined,
  fallback: ImageMeta[],
): ImageMeta[] {
  if (!assigned || assigned.length === 0) return fallback;

  const byName = new Map(all.map((img) => [img.filename, img]));
  const resolved: ImageMeta[] = [];
  const missing: string[] = [];

  for (const name of assigned) {
    const img = byName.get(name);
    if (img) resolved.push(img);
    else missing.push(name);
  }

  if (missing.length > 0) {
    console.warn(`⚠ manifest references missing files: ${missing.join(', ')}`);
  }

  return resolved.length > 0 ? resolved : fallback;
}

/** Pick best side-profile candidates: standard landscape aspect, highest resolution first */
function autoSideProfile(all: ImageMeta[]): ImageMeta[] {
  const candidates = all
    .filter((img) => img.aspectRatio >= 1.25 && img.aspectRatio <= 2.0)
    .sort((a, b) => b.width * b.height - a.width * a.height);

  return candidates.length > 0 ? [candidates[0]] : [all[0]];
}

/** Body-work references: ultra-wide shots + remaining lower-priority references */
function autoBodyWork(all: ImageMeta[], sideProfile: ImageMeta[], colorPatina: ImageMeta[]): ImageMeta[] {
  const assigned = new Set([
    ...sideProfile.map((i) => i.filename),
    ...colorPatina.map((i) => i.filename),
  ]);

  const body = all.filter(
    (img) => !assigned.has(img.filename) && (img.aspectRatio > 2.0 || img.width <= 900),
  );

  return body.length > 0 ? body : all.filter((img) => !assigned.has(img.filename));
}

/** Complete-car color references: highest-res remaining standard-aspect shots */
function autoColorPatina(all: ImageMeta[], sideProfile: ImageMeta[]): ImageMeta[] {
  const sideNames = new Set(sideProfile.map((i) => i.filename));
  const remaining = all
    .filter((img) => !sideNames.has(img.filename) && img.aspectRatio <= 2.0)
    .sort((a, b) => b.width * b.height - a.width * a.height);

  // Up to 2 complete-car references; fall back to any remaining images
  const color = remaining.slice(0, 2);
  return color.length > 0 ? color : all.filter((img) => !sideNames.has(img.filename));
}

function autoClassify(all: ImageMeta[]): Pick<ReferenceLibrary, 'all' | 'sideProfile' | 'bodyWork' | 'colorPatina'> {
  const sideProfile = autoSideProfile(all);
  const colorPatina = autoColorPatina(all, sideProfile);
  const bodyWork = autoBodyWork(all, sideProfile, colorPatina);

  return { all, sideProfile, bodyWork, colorPatina };
}

function writeSuggestedManifest(manifestPath: string, library: ReferenceLibrary) {
  const suggested = {
    _comment:
      'Assign images to roles. Empty arrays = auto-detect. Re-run generate:images after editing.',
    sideProfile: library.sideProfile.map((i) => i.filename),
    bodyWork: library.bodyWork.map((i) => i.filename),
    colorPatina: library.colorPatina.map((i) => i.filename),
  };

  fs.writeFileSync(manifestPath, `${JSON.stringify(suggested, null, 2)}\n`);
}

export function discoverReferences(baseImagesDir: string): ReferenceLibrary {
  const all = scanImages(baseImagesDir);
  const manifestPath = path.join(baseImagesDir, 'manifest.json');
  const manifest = loadManifest(manifestPath);
  const manifestExists = manifest !== null;

  const auto = autoClassify(all);

  const library: ReferenceLibrary = {
    all,
    sideProfile: resolveRole(all, manifest?.sideProfile, auto.sideProfile),
    bodyWork: resolveRole(all, manifest?.bodyWork, auto.bodyWork),
    colorPatina: resolveRole(all, manifest?.colorPatina, auto.colorPatina),
    manifestPath,
    manifestExists,
  };

  if (!manifestExists) {
    writeSuggestedManifest(manifestPath, library);
  } else {
    const assigned = new Set([
      ...library.sideProfile.map((i) => i.filename),
      ...library.bodyWork.map((i) => i.filename),
      ...library.colorPatina.map((i) => i.filename),
    ]);
    const unassigned = all.filter((img) => !assigned.has(img.filename));
    if (unassigned.length > 0) {
      console.warn(
        `⚠ ${unassigned.length} image(s) not in manifest.json (will be ignored): ${unassigned.map((i) => i.filename).join(', ')}`,
      );
    }
  }

  return library;
}

export function pathsFor(images: ImageMeta[]): string[] {
  return images.map((i) => i.path);
}

export function namesFor(images: ImageMeta[]): string {
  return images.map((i) => i.filename).join(', ');
}

export function uniquePaths(...groups: ImageMeta[][]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const group of groups) {
    for (const img of group) {
      if (!seen.has(img.path)) {
        seen.add(img.path);
        result.push(img.path);
      }
    }
  }
  return result;
}

export function buildAnchorPrompt(library: ReferenceLibrary): string {
  const sideCount = library.sideProfile.length;
  const colorCount = library.colorPatina.length;

  return `
Create the canonical master reference image for a Ferrari Dino 246 GT restoration sequence.

${library.all.length} reference photographs from this restoration are provided:
- IMAGE 1${sideCount > 1 ? `–${sideCount}` : ''}: side-profile shot(s) — ${namesFor(library.sideProfile)}. Use for EXACT camera angle, framing, car scale, and proportions.
${colorCount > 0 ? `- Color/patina references — ${namesFor(library.colorPatina)}. Use for Azzurro Metallizzato color tone and surface condition cues.` : ''}

VEHICLE IDENTITY (must be correct):
- Ferrari Dino 246 GT — fixed-roof coupe (NOT GTS, NOT targa, NOT spider)
- Mid-engine layout with iconic side air intake scoop behind the door
- Distinctive 1970s Pininfarina curves: long hood, short deck, rounded fenders

Output: a complete Ferrari Dino 246 GT in rough "as found" condition — all panels, glass,
wheels, and trim present but clearly neglected and in need of restoration. Faded dull paint
with scratches, chips, oxidation, grime, dull pitted chrome, dirty glass, and tired tires.
It must look like a project car, not clean or well kept. Underneath the wear, the original
color is faded Azzurro Metallizzato. Parked on a clean studio floor at the exact position
and scale from the side-profile reference.

CONTINUITY LOCK — THESE MUST NOT CHANGE BETWEEN ANY PHASE:
- Perfect 90° side profile (orthographic, zero perspective distortion)
- Car faces RIGHT, centered horizontally in frame
- Camera at door-handle height, lens perpendicular to the car
- Car silhouette occupies exactly 70% of frame width
- Ground plane at 78% from top of frame; identical car placement on every image
- Uniform neutral studio background: smooth gray gradient (#c8c8c8 center, #a0a0a0 edges)
- Lighting: single soft key from upper-left 45°, gentle fill from right
- No rotation, zoom, crop, or reframing — pixel-aligned composition every time
- No text, watermarks, people, or environment
`.trim();
}

export function printLibrarySummary(library: ReferenceLibrary) {
  console.log(`Found ${library.all.length} reference image(s) in base-images/:`);
  for (const img of library.all) {
    console.log(`  • ${img.filename} (${img.width}×${img.height})`);
  }
  console.log('');
  console.log('Roles:');
  console.log(`  Side profile:  ${namesFor(library.sideProfile)}`);
  console.log(`  Body work:     ${namesFor(library.bodyWork)}`);
  console.log(`  Color / patina: ${namesFor(library.colorPatina)}`);
  if (!library.manifestExists) {
    console.log(`\n  Created ${library.manifestPath} — edit roles and re-run if needed.`);
  }
  console.log('');
}
