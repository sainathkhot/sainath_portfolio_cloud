import sans700 from '@fontsource/dm-sans/files/dm-sans-latin-700-normal.woff?url'
import sans500 from '@fontsource/dm-sans/files/dm-sans-latin-500-normal.woff?url'
import serifItalic from '@fontsource/instrument-serif/files/instrument-serif-latin-400-italic.woff?url'
import mono from '@fontsource/dm-mono/files/dm-mono-latin-500-normal.woff?url'

// troika parses fonts in a worker, so hand it absolute URLs
const abs = (u: string) => new URL(u, document.baseURI).href
export const FONTS = {
  display: abs(sans700),
  sans: abs(sans500),
  serif: abs(serifItalic),
  mono: abs(mono),
}
