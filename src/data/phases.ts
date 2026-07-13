export const RESTORATION_PHASES = [
  {
    id: '01-original',
    slug: 'original',
    title: 'Original Car',
    description: 'As found — rough, tired, needs restoration',
    image: '/images/phases/01-original.jpg',
  },
  {
    id: '02-strip',
    slug: 'strip',
    title: 'Strip to Body',
    description: 'Stripped to bare shell',
    image: '/images/phases/02-strip.jpg',
  },
  {
    id: '03-sandblast',
    slug: 'sandblast',
    title: 'Sandblast',
    description: 'Media-blasted bare metal',
    image: '/images/phases/03-sandblast.jpg',
  },
  {
    id: '04-metalwork',
    slug: 'metalwork',
    title: 'Metalwork',
    description: 'Panel repair and fabrication',
    image: '/images/phases/04-metalwork.jpg',
  },
  {
    id: '05-primer',
    slug: 'primer',
    title: 'Primer',
    description: 'Epoxy primer coat applied',
    image: '/images/phases/05-primer.jpg',
  },
  {
    id: '06-paint',
    slug: 'paint',
    title: 'Paint',
    description: 'Azzurro Metallizzato applied',
    image: '/images/phases/06-paint.jpg',
  },
  {
    id: '07-reassembly',
    slug: 'reassembly',
    title: 'Reassembly',
    description: 'Components going back on',
    image: '/images/phases/07-reassembly.jpg',
  },
  {
    id: '08-finished',
    slug: 'finished',
    title: 'Finished',
    description: 'Azzurro Metallizzato — concours ready',
    image: '/images/phases/08-finished.jpg',
  },
] as const;

export const PHASE_COUNT = RESTORATION_PHASES.length;

/** Scroll height per phase in viewport units */
export const SCROLL_PER_PHASE_VH = 100;

export const TOTAL_SCROLL_VH = PHASE_COUNT * SCROLL_PER_PHASE_VH;
