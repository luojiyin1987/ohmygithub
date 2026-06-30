export interface ActionRunLogStepReference {
  number: number
  name: string
  status?: GitHubActionRunStatus | null
  conclusion?: GitHubActionConclusion | null
}

export interface ActionRunLogSection {
  content: string
  id: string
  kind: 'step' | 'system'
  step: ActionRunLogStepReference | null
  title: string
}

const TIMESTAMPED_GROUP_PATTERN = /^(?:\S+\s+)?(?:##\[group\]|::group::)(.*)$/
const TIMESTAMPED_END_GROUP_PATTERN = /^(?:\S+\s+)?(?:##\[endgroup\]|::endgroup::)\s*$/

export function splitActionJobLogIntoSections(
  content: string,
  steps: ActionRunLogStepReference[],
): ActionRunLogSection[] {
  const lines = content.trimEnd().split(/\r?\n/)
  const stepByName = createStepLookup(steps)
  const sections: ActionRunLogSection[] = []
  let current = createInitialSection(steps)

  for (const line of lines) {
    const groupTitle = readGroupTitle(line)
    const matchedStep = groupTitle ? stepByName.get(normalizeTitle(groupTitle)) ?? null : null

    if (matchedStep) {
      flushSection(sections, current)
      current = createStepSection(matchedStep)
      continue
    }

    if (TIMESTAMPED_END_GROUP_PATTERN.test(line)) {
      continue
    }

    current.lines.push(groupTitle ? formatGroupTitle(groupTitle) : line)
  }

  flushSection(sections, current)

  return sections
}

function createStepLookup(steps: ActionRunLogStepReference[]): Map<string, ActionRunLogStepReference> {
  const lookup = new Map<string, ActionRunLogStepReference>()

  for (const step of steps) {
    const normalizedName = normalizeTitle(step.name)
    lookup.set(normalizedName, step)

    const withoutRunPrefix = normalizedName.replace(/^run\s+/, '')
    if (withoutRunPrefix !== normalizedName) {
      lookup.set(withoutRunPrefix, step)
    }
  }

  return lookup
}

function createSystemSection(): MutableLogSection {
  return {
    id: 'system',
    kind: 'system',
    lines: [],
    step: null,
    title: 'Setup / Other',
  }
}

function createInitialSection(steps: ActionRunLogStepReference[]): MutableLogSection {
  const firstStep = steps[0]
  if (firstStep && normalizeTitle(firstStep.name) === 'set up job') {
    return createStepSection(firstStep)
  }

  return createSystemSection()
}

function createStepSection(step: ActionRunLogStepReference): MutableLogSection {
  return {
    id: `step:${step.number}:${step.name}`,
    kind: 'step',
    lines: [],
    step,
    title: step.name,
  }
}

function flushSection(sections: ActionRunLogSection[], section: MutableLogSection): void {
  const content = section.lines.join('\n').trimEnd()
  if (!content) return

  sections.push({
    content,
    id: section.id,
    kind: section.kind,
    step: section.step,
    title: section.title,
  })
}

function readGroupTitle(line: string): string | null {
  const match = line.match(TIMESTAMPED_GROUP_PATTERN)
  const title = match?.[1]?.trim()

  return title || null
}

function formatGroupTitle(title: string): string {
  return `# ${title}`
}

function normalizeTitle(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

interface MutableLogSection {
  id: string
  kind: 'step' | 'system'
  lines: string[]
  step: ActionRunLogStepReference | null
  title: string
}
