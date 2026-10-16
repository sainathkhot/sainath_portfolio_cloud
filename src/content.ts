// Every fact on the site lives here. Nothing outside this file states a claim.
// All figures below were supplied and confirmed by Sainath. Do not add numbers that are not on this page.

export const PERSON = {
  name: 'Sainath Khot',
  role: 'AI / Product Engineer',
  location: 'Mumbai, India',
}

export const LINKS = {
  email: 'sainathkhot206@gmail.com',
  linkedin: 'https://linkedin.com/in/sainath-khot',
  github: 'https://github.com/sainathkhot',
}

export const SECTIONS = ['hero', 'about', 'p1', 'p2', 'p3', 'p4', 'p5', 'toolkit', 'other', 'record', 'contact'] as const
export type SectionId = (typeof SECTIONS)[number]

// Section heights in viewport units. The film position s = sectionIndex + progress.
export const SECTION_VH: Record<SectionId, number> = {
  hero: 200, about: 150, p1: 220, p2: 200, p3: 200, p4: 240, p5: 240, toolkit: 240, other: 190, record: 420, contact: 230,
}

export type Fact = readonly [value: string, label: string]

export const PROJECTS = [
  {
    id: 'p1',
    name: 'Agentic Agile',
    sub: 'Platform and VS Code extension',
    label: 'Multi-agent AI orchestration',
    headline: ['A system that', { em: 'pauses.' }],
    body: 'Five specialised agents handle requirement analysis, sprint planning, code generation and review across a 12-node LangGraph workflow, with intelligent routing between three LLMs. At the human checkpoint the whole system stops, and nothing resumes until a person decides.',
    facts: [['70%', 'Less Agile workflow time'], ['3×', 'Faster task delegation'], ['40%', 'Less inference-switching overhead'], ['12', 'Node LangGraph workflow']] as Fact[],
    stack: 'TypeScript · LangGraph · Python · FastAPI · OpenRouter · Ollama',
  },
  {
    id: 'p2',
    name: 'AI Chatbot',
    sub: 'Semantic retrieval and NL-to-SQL',
    label: 'Natural language → data',
    headline: ['Ask the', { em: 'system.' }],
    body: 'A plain question moves through intent detection and semantic retrieval before it becomes SQL against the database. When SQL is the wrong tool, it falls back to semantic search instead of guessing.',
    facts: [['~95%', 'Accuracy, internal tests'], ['NL → SQL', 'Translation'], ['ChromaDB', 'Retrieval'], ['Semantic', 'Fallback']] as Fact[],
    note: '~95% accuracy across internally tested queries, delivering relevant semantic retrieval and NL-to-SQL responses.',
    stack: 'FastAPI · ChromaDB · NL-to-SQL',
  },
  {
    id: 'p3',
    name: 'ShopperMatch.AI',
    sub: 'Shopper recommendation and outreach',
    label: 'Geospatial matching',
    headline: ['Proximity becomes', { em: 'relevance.' }],
    body: 'ShopperMatch.AI ranks shoppers for each job by distance and fit, then helps run the outreach. It plugs into SASSIE, so recommendations start from the data the operation already keeps.',
    facts: [['Distance', 'First signal'], ['Fit', 'Second signal'], ['SASSIE', 'Integration'], ['MVP', 'Stage']] as Fact[],
    stack: 'Geospatial scoring · Outreach · SASSIE',
  },
  {
    id: 'p4',
    name: 'Blue Marine',
    sub: 'Government Import Permit & Licensing Platform',
    label: 'Digital government · Import control',
    status: 'Ongoing',
    headline: ['A workflow that can', { em: 'bend.' }],
    body: 'A full digital platform for a government import regime: importer onboarding, quota applications, permit processing, document and physical verification, officer assignment, review and licensing. Work moves between the Director, Assistant Director and Principal Officer, and send-backs, reassignments and escalations are designed paths, not exceptions.',
    facts: [['Onboarding', 'Importers'], ['Quotas · Permits', 'Applications'], ['Document · Physical', 'Verification'], ['Licensing', 'After review']] as Fact[],
    stack: 'Director · Assistant Director · Principal Officer · Send-back · Escalation',
  },
  {
    id: 'p5',
    name: 'E-Parking',
    sub: 'Vehicle access and parking management',
    label: 'Garki International Market · Abuja',
    headline: ['From plate to', { em: 'gate.' }],
    body: 'A computer-vision-assisted vehicle access and parking management system. At the gate, cameras identify each vehicle by its plate and classify its type, the parking fee follows from that type, and payment and controlled entry and exit run through dedicated gate and POS apps, with an admin panel over the whole operation.',
    facts: [['Plate', 'Vehicle identification'], ['By vehicle type', 'Fee determination'], ['POS', 'Payment'], ['Entry · Exit', 'Gate control']] as Fact[],
    stack: 'Admin panel · Backend · Gate dispenser app · POS payment app',
  },
] as const

export type Headline = readonly (string | { em: string })[]

export const TOOLS = [
  { id: 'python', name: 'Python', role: 'Agents, pipelines, data work', rel: ['fastapi', 'llms', 'langgraph', 'chromadb'] },
  { id: 'typescript', name: 'TypeScript', role: 'Typed frontends and tooling', rel: ['react', 'threejs', 'gsap'] },
  { id: 'react', name: 'React', role: 'Interfaces people operate', rel: ['typescript', 'gsap', 'threejs'] },
  { id: 'fastapi', name: 'FastAPI', role: 'Service layer for AI backends', rel: ['python', 'postgres', 'chromadb', 'docker'] },
  { id: 'langgraph', name: 'LangGraph', role: 'Stateful agent workflows', rel: ['python', 'llms', 'ollama'] },
  { id: 'postgres', name: 'PostgreSQL', role: 'System of record', rel: ['fastapi', 'python', 'docker'] },
  { id: 'llms', name: 'LLMs', role: 'Reasoning, routing, generation', rel: ['langgraph', 'ollama', 'chromadb', 'fastapi'] },
  { id: 'chromadb', name: 'ChromaDB', role: 'Semantic retrieval', rel: ['llms', 'python', 'fastapi'] },
  { id: 'threejs', name: 'Three.js', role: 'Spatial interfaces, like this one', rel: ['react', 'typescript', 'gsap'] },
  { id: 'gsap', name: 'GSAP', role: 'Motion with a reason', rel: ['react', 'threejs', 'typescript'] },
  { id: 'docker', name: 'Docker', role: 'Reproducible deploys', rel: ['fastapi', 'postgres', 'ollama'] },
  { id: 'ollama', name: 'Ollama', role: 'Local models, private data', rel: ['llms', 'langgraph', 'docker'] },
] as const
export type ToolId = (typeof TOOLS)[number]['id']

export type OtherWork = { id: string; name: string; desc: string; metric?: readonly [string, string]; stack: string }
// Only projects with a verified description appear here.
export const OTHER_WORK: OtherWork[] = [
  {
    id: 'recon',
    name: 'Recon',
    desc: 'AI-powered company research assistant. Aggregates multi-source company data into a structured intelligence report.',
    metric: ['< 60 s', 'per query'],
    stack: 'Next.js · TypeScript · Tailwind CSS · LLM integration · REST APIs',
  },
  {
    id: 'finsage',
    name: 'FinSage',
    desc: 'Full-stack financial analyzer. LLM categorization at 90% accuracy, AI savings recommendations, and 60% less time spent on analysis.',
    metric: ['10,000+', 'transactions per session'],
    stack: 'Next.js · React · TypeScript · FastAPI · Python · Recharts',
  },
  {
    id: 'calls',
    name: 'Call Transcription',
    desc: 'Internal call transcription and translation platform. Calls are transcribed with AssemblyAI, and the transcripts are translated with Google Gemini.',
    stack: 'AssemblyAI · Google Gemini',
  },
]

// Recognition & Delivery: two banners, delivered by the eagle.
export type Achievement = { mark: string; title: string; detail: string }
export type Role = { title: string; org: string; when: string }
export const BANNERS = {
  recognition: {
    eyebrow: 'Recognition & impact',
    items: [
      { mark: '2nd', title: 'VNPS', detail: 'National-level product showcase' },
      { mark: 'Top 5', title: 'Blockchain Hackathon', detail: 'Finalist' },
      { mark: '45', title: 'Vulnerabilities resolved', detail: 'In a critical production project' },
    ] as Achievement[],
  },
  path: {
    eyebrow: 'Experience & education',
    roles: [
      { title: 'AI Executive', org: 'ISN Business Solutions', when: '2026' },
      { title: 'Data Engineer Intern', org: 'Sharv AutoTech Solutions', when: '2025' },
    ] as Role[],
    education: { title: 'B.E. Artificial Intelligence & Data Science', org: 'VCET, Mumbai', when: '2022–2026' },
  },
}
