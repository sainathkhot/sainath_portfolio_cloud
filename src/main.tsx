import { createRoot } from 'react-dom/client'
// self-hosted type: no third-party font request, and the DOM and WebGL text share one source
import '@fontsource/dm-sans/latin-400.css'
import '@fontsource/dm-sans/latin-500.css'
import '@fontsource/dm-sans/latin-600.css'
import '@fontsource/dm-sans/latin-700.css'
import '@fontsource/instrument-serif/latin-400.css'
import '@fontsource/instrument-serif/latin-400-italic.css'
import '@fontsource/dm-mono/latin-400.css'
import '@fontsource/dm-mono/latin-500.css'
import { App } from './App'
import './styles.css'

createRoot(document.getElementById('root')!).render(<App />)

// preview builds only: the ?perf overlay (frame times, render resolution, a scripted scroll path); compiled out of main
if (__PREVIEW_TOOLS__ && new URLSearchParams(location.search).has('perf')) import('./ui/PerfHud').then((m) => m.mountPerfHud())
