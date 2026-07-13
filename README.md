# Ferrari Dino Restoration

An animated scroll website that walks through the restoration of a Ferrari Dino 246 GTS. The car stays fixed in a side-profile view while you scroll through eight restoration phases — scrub forward and backward smoothly, pausing on any step.

## Phases

1. **Original Car** — as found
2. **Strip to Body** — stripped to bare shell
3. **Sandblast** — media-blasted bare metal
4. **Metalwork** — panel repair and fabrication
5. **Primer** — epoxy primer coat
6. **Paint** — fresh color applied
7. **Reassembly** — components going back on
8. **Finished** — concours-ready

## Setup

```bash
npm install
```

Copy the environment file and add your OpenAI API key:

```bash
cp .env.example .env
# Edit .env and set OPENAI_API_KEY=sk-...
```

## Generate Phase Images

Reference photos live in `base-images/`. Drop any `.jpg`, `.png`, or `.webp` files in that folder — the script discovers them automatically.

On first run, a `base-images/manifest.json` is created with suggested roles:

| Role | Purpose |
|------|---------|
| `sideProfile` | Side-profile shots for camera angle and framing |
| `bodyWork` | Body shell / in-progress restoration references |
| `colorPatina` | Complete-car color and patina references |

Edit the manifest to reassign images, then re-run. Empty role arrays fall back to auto-detection.

```bash
npm run generate:images
```

### Continuity pipeline

1. **Canonical anchor** (`_00-canonical-anchor.jpg`) — created from your side-profile photo (`IMG_4437`) + color reference (`IMG_8670`), establishing the fixed studio composition
2. **Each phase** — edits from the anchor + the previous phase output (chained) + body-shell reference for in-progress steps
3. **Every prompt** includes a continuity lock (camera angle, framing, ground position, lighting, background)

Options:

- `--force` — regenerate even if images already exist
- `--only=primer` — generate a single phase by slug or id
- `--anchor-only` — generate just the canonical anchor
- `--no-chain` — skip using the previous phase as a reference

For best results, regenerate all phases in order:

```bash
npm run generate:images -- --force
```

## Development

```bash
npm run dev
```

Open the URL shown in the terminal (usually `http://localhost:5173`).

## Build

```bash
npm run build
npm run preview
```

## How It Works

- **Scroll scrubbing** — 100vh of scroll per phase gives you room to pause on each step. Crossfade between adjacent images is driven directly by scroll position, so scrolling up reverses the animation smoothly.
- **Fixed car** — the side view stays centered; only the restoration state changes.
- **Image generation** — uses OpenAI's `gpt-image-1` model with your reference photos from `base-images/` to maintain consistent framing, angle, and proportions across all eight phases.
