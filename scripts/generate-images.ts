import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import OpenAI, { toFile } from 'openai';
import type { ImagesResponse } from 'openai/resources/images';
import {
  buildAnchorPrompt,
  discoverReferences,
  namesFor,
  printLibrarySummary,
  uniquePaths,
  type ReferenceLibrary,
} from './lib/references.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BASE_IMAGES_DIR = path.join(ROOT, 'base-images');
const OUTPUT_DIR = path.join(ROOT, 'public', 'images', 'phases');

const ANCHOR_FILENAME = '_00-canonical-anchor.jpg';
const IMAGE_SIZE = '1536x1024' as const;
const IMAGE_MODEL = 'gpt-image-1';

/** Ferrari Dino 246 GT — fixed-roof coupe identity for every phase */
const VEHICLE_SPEC = `
VEHICLE IDENTITY (must be correct in every image):
- Ferrari Dino 246 GT — fixed-roof coupe (NOT GTS, NOT targa, NOT spider)
- Mid-engine layout with iconic side air intake scoop behind the door
- Distinctive 1970s Pininfarina curves: long hood, short deck, rounded fenders
- Cromodora-style star alloy wheels when wheels are present
- Small chrome bumpers, side mirrors, and window trim when fitted
`.trim();

/** Target finish color for paint, reassembly, and finished phases */
const FINISH_COLOR = `
FINISH COLOR — Azzurro Metallizzato:
- Ferrari factory light metallic blue (Azzurro Metallizzato)
- Soft luminous silver-blue metallic flake, bright but not dark navy
- Period-correct 1970s Ferrari paint depth and clearcoat
`.trim();

const CONTINUITY_LOCK = `
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

export const RESTORATION_PHASES = [
  {
    id: '01-original',
    slug: 'original',
    title: 'Original Car',
    description: 'As found — tired, rough, needs restoration',
    prompt: `
Using the reference image as the exact composition template, show a Ferrari Dino 246 GT
in rough "as found" condition — clearly neglected and in need of a full restoration.

${VEHICLE_SPEC}

The car is complete (all body panels, glass, wheels, bumpers, and trim still on) but looks
rough and tired: faded dull paint with scratches, chips, and oxidation; surface rust on
chrome trim and bumper edges; grime and dust on lower body panels; dirty glass; dull pitted
chrome; cracked or aged rubber seals; flat-spotted, dirty vintage tires. It should look
unmistakably like a project car that needs restoration — not clean, not shiny, not well kept.

Original paint may be faded Azzurro Metallizzato underneath the wear, but overall appearance
is rough and weathered.

Change ONLY the restoration state — not the camera, framing, position, or background.
${CONTINUITY_LOCK}
`.trim(),
  },
  {
    id: '02-strip',
    slug: 'strip',
    title: 'Strip to Body',
    description: 'Stripped to bare shell',
    prompt: `
Using the reference image as the exact composition template, show a Ferrari Dino 246 GT
stripped to a bare metal body shell. Same silhouette and ground position.

${VEHICLE_SPEC}

All glass, doors, hood, trunk, interior, engine, wheels, bumpers, and trim removed.
Empty wheel arches in the same positions. Bare unpainted steel panels.
Low jack stands barely visible under the shell.

Change ONLY the restoration state — not the camera, framing, position, or background.
${CONTINUITY_LOCK}
`.trim(),
  },
  {
    id: '03-sandblast',
    slug: 'sandblast',
    title: 'Sandblast',
    description: 'Media-blasted bare metal',
    prompt: `
Using the reference image as the exact composition template, show a Ferrari Dino 246 GT body shell
after sandblasting. Same silhouette and ground position.

${VEHICLE_SPEC}

Uniform matte silver-gray blasted steel finish across all panels. No paint.
Empty wheel arches unchanged.

Change ONLY the restoration state — not the camera, framing, position, or background.
${CONTINUITY_LOCK}
`.trim(),
  },
  {
    id: '04-metalwork',
    slug: 'metalwork',
    title: 'Metalwork',
    description: 'Panel repair and fabrication',
    prompt: `
Using the reference image as the exact composition template, show a Ferrari Dino 246 GT body shell
during metalwork. Same silhouette and ground position.

${VEHICLE_SPEC}

Bare metal with subtle weld seams, hammer marks, and patched panels — skilled bodywork
in progress. Mixed matte and slightly worked metal textures.

Change ONLY the restoration state — not the camera, framing, position, or background.
${CONTINUITY_LOCK}
`.trim(),
  },
  {
    id: '05-primer',
    slug: 'primer',
    title: 'Primer',
    description: 'Epoxy primer coat applied',
    prompt: `
Using the reference image as the exact composition template, show a Ferrari Dino 246 GT body shell
coated in uniform flat gray epoxy primer. Same silhouette and ground position.

${VEHICLE_SPEC}

Matte gray primer over entire body, no color coat yet. Empty wheel arches unchanged.

Change ONLY the restoration state — not the camera, framing, position, or background.
${CONTINUITY_LOCK}
`.trim(),
  },
  {
    id: '06-paint',
    slug: 'paint',
    title: 'Paint',
    description: 'Azzurro Metallizzato applied',
    prompt: `
Using the reference image as the exact composition template, show a Ferrari Dino 246 GT body shell
with fresh glossy Azzurro Metallizzato paint applied. Same silhouette and ground position.

${VEHICLE_SPEC}
${FINISH_COLOR}

Wet-look clearcoat over Azzurro Metallizzato, still no doors, glass, or wheels —
body shell only. Empty wheel arches unchanged.

Change ONLY the restoration state — not the camera, framing, position, or background.
${CONTINUITY_LOCK}
`.trim(),
  },
  {
    id: '07-reassembly',
    slug: 'reassembly',
    title: 'Reassembly',
    description: 'Components going back on',
    prompt: `
Using the reference image as the exact composition template, show a Ferrari Dino 246 GT during
reassembly. Same silhouette and ground position.

${VEHICLE_SPEC}
${FINISH_COLOR}

Fresh Azzurro Metallizzato paint, Cromodora wheels mounted, some glass and chrome trim
installed — partially complete, work in progress.

Change ONLY the restoration state — not the camera, framing, position, or background.
${CONTINUITY_LOCK}
`.trim(),
  },
  {
    id: '08-finished',
    slug: 'finished',
    title: 'Finished',
    description: 'Azzurro Metallizzato — concours ready',
    prompt: `
Using the reference image as the exact composition template, show a Ferrari Dino 246 GT
in concours-ready finished condition. Same silhouette and ground position.

${VEHICLE_SPEC}
${FINISH_COLOR}

Flawless Azzurro Metallizzato paint with mirror-like clearcoat, perfect chrome bumpers and
trim, Cromodora wheels with yellow Ferrari center caps, tan or black interior visible
through glass. Museum-quality restoration complete.

Change ONLY the restoration state — not the camera, framing, position, or background.
${CONTINUITY_LOCK}
`.trim(),
  },
] as const;

const BODY_PHASE_IDS = new Set([
  '02-strip',
  '03-sandblast',
  '04-metalwork',
  '05-primer',
  '06-paint',
]);

function mimeTypeForPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

async function loadImageFile(filePath: string) {
  const buffer = fs.readFileSync(filePath);
  return toFile(buffer, path.basename(filePath), { type: mimeTypeForPath(filePath) });
}

function readImageResponse(response: ImagesResponse): Buffer {
  const b64 = response.data?.[0]?.b64_json;
  if (!b64) {
    throw new Error('No image data returned from API');
  }
  return Buffer.from(b64, 'base64');
}

async function editImage(
  client: OpenAI,
  imagePaths: string[],
  prompt: string,
): Promise<Buffer> {
  const images = await Promise.all(imagePaths.map(loadImageFile));

  const response = await client.images.edit({
    model: IMAGE_MODEL,
    image: images.length === 1 ? images[0] : images,
    prompt,
    n: 1,
    size: IMAGE_SIZE,
    quality: 'high',
    ...({
      output_format: 'jpeg',
      input_fidelity: 'high',
    } as Record<string, string>),
  });

  return readImageResponse(response);
}

function anchorReferencePaths(library: ReferenceLibrary): string[] {
  return uniquePaths(library.sideProfile, library.colorPatina);
}

function phaseReferencePaths(
  library: ReferenceLibrary,
  phaseId: string,
): string[] {
  if (BODY_PHASE_IDS.has(phaseId)) {
    return uniquePaths(library.sideProfile, library.bodyWork);
  }
  return uniquePaths(library.sideProfile, library.colorPatina);
}

async function ensureCanonicalAnchor(
  client: OpenAI,
  library: ReferenceLibrary,
  force: boolean,
): Promise<string> {
  const anchorPath = path.join(OUTPUT_DIR, ANCHOR_FILENAME);

  if (fs.existsSync(anchorPath) && !force) {
    console.log(`✓ Canonical anchor exists: ${ANCHOR_FILENAME}`);
    return anchorPath;
  }

  const refs = anchorReferencePaths(library);
  console.log('→ Generating canonical anchor (locked side-profile composition)...');
  console.log(`  Sources: ${refs.map((p) => path.basename(p)).join(' + ')}`);

  const imageBuffer = await editImage(client, refs, buildAnchorPrompt(library));

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(anchorPath, imageBuffer);
  console.log(`  ✓ Saved ${anchorPath}\n`);

  return anchorPath;
}

function getPreviousPhasePath(currentIndex: number): string | null {
  if (currentIndex <= 0) return null;
  const prev = RESTORATION_PHASES[currentIndex - 1];
  const prevPath = path.join(OUTPUT_DIR, `${prev.id}.jpg`);
  return fs.existsSync(prevPath) ? prevPath : null;
}

async function generatePhaseImage(
  client: OpenAI,
  phase: (typeof RESTORATION_PHASES)[number],
  phaseIndex: number,
  anchorPath: string,
  library: ReferenceLibrary,
  useChain: boolean,
): Promise<Buffer> {
  const references = [anchorPath];
  const prevPath = getPreviousPhasePath(phaseIndex);

  if (useChain && prevPath) {
    references.push(prevPath);
  }

  const baseRefs = phaseReferencePaths(library, phase.id);
  for (const ref of baseRefs) {
    if (!references.includes(ref)) {
      references.push(ref);
    }
  }

  const chainNote =
    useChain && prevPath
      ? `\nThe image after the anchor is the previous restoration phase — match its composition exactly while applying the new restoration state described below.`
      : '';

  const contextNote = `
Reference photographs from this restoration (${namesFor(library.all)}):
- Side profile: ${namesFor(library.sideProfile)}
- Body work: ${namesFor(library.bodyWork)}
- Color / patina: ${namesFor(library.colorPatina)}
`.trim();

  const prompt = `${chainNote}\n\n${contextNote}\n\n${phase.prompt}`;

  try {
    return await editImage(client, references, prompt);
  } catch (editError) {
    console.log(`  images.edit failed, retrying with anchor only...`);
    console.log(`  ${editError instanceof Error ? editError.message : editError}`);
    return editImage(client, [anchorPath], prompt);
  }
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('Error: OPENAI_API_KEY is not set. Copy .env.example to .env and add your key.');
    process.exit(1);
  }

  const library = discoverReferences(BASE_IMAGES_DIR);
  printLibrarySummary(library);

  const client = new OpenAI({ apiKey });
  const force = process.argv.includes('--force');
  const noChain = process.argv.includes('--no-chain');
  const anchorOnly = process.argv.includes('--anchor-only');
  const onlyArg = process.argv.find((a) => a.startsWith('--only='));
  const onlySlug = onlyArg?.split('=')[1];

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const anchorPath = await ensureCanonicalAnchor(client, library, force);

  if (anchorOnly) {
    console.log('Anchor-only mode — done.');
    return;
  }

  const useChain = !noChain;

  let phases: (typeof RESTORATION_PHASES)[number][];
  if (onlySlug) {
    phases = RESTORATION_PHASES.filter((p) => p.slug === onlySlug || p.id === onlySlug);
  } else {
    phases = [...RESTORATION_PHASES];
  }

  if (phases.length === 0) {
    console.error(`No phase found matching: ${onlySlug}`);
    process.exit(1);
  }

  if (useChain) {
    const indices = phases.map((p) => RESTORATION_PHASES.indexOf(p));
    const sorted = [...indices].sort((a, b) => a - b);
    if (JSON.stringify(indices) !== JSON.stringify(sorted)) {
      console.warn('⚠ Chain mode works best when phases are generated in order (01 → 08).');
    }
    for (const idx of indices) {
      if (idx > 0 && !getPreviousPhasePath(idx)) {
        const prev = RESTORATION_PHASES[idx - 1];
        console.warn(`⚠ Missing ${prev.id}.jpg — chain will use anchor only for ${RESTORATION_PHASES[idx].id}.`);
      }
    }
  }

  console.log(`Generating ${phases.length} phase image(s) with continuity:`);
  console.log(`  Anchor: ${ANCHOR_FILENAME}`);
  console.log(`  Chain:  ${useChain ? 'on (each phase references the previous)' : 'off'}`);
  console.log(`  Output: ${OUTPUT_DIR}\n`);

  for (const phase of phases) {
    const phaseIndex = RESTORATION_PHASES.indexOf(phase);
    const outputPath = path.join(OUTPUT_DIR, `${phase.id}.jpg`);

    if (fs.existsSync(outputPath) && !force) {
      console.log(`✓ ${phase.id} — already exists (use --force to regenerate)`);
      continue;
    }

    console.log(`→ Generating ${phase.id}: ${phase.title}...`);
    const refs = [ANCHOR_FILENAME];
    const prev = getPreviousPhasePath(phaseIndex);
    if (useChain && prev) refs.push(path.basename(prev));
    const baseNames = phaseReferencePaths(library, phase.id).map((p) => path.basename(p));
    refs.push(...baseNames.filter((n) => !refs.includes(n)));
    console.log(`  References: ${refs.join(' + ')}`);

    try {
      const imageBuffer = await generatePhaseImage(
        client,
        phase,
        phaseIndex,
        anchorPath,
        library,
        useChain,
      );
      fs.writeFileSync(outputPath, imageBuffer);
      console.log(`  ✓ Saved ${outputPath}`);
    } catch (error) {
      console.error(`  ✗ Failed ${phase.id}:`, error instanceof Error ? error.message : error);
    }

    await new Promise((r) => setTimeout(r, 2000));
  }

  console.log('\nDone! Run `npm run dev` to preview the site.');
  console.log('Tip: regenerate all phases in order with `npm run generate:images -- --force`');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
