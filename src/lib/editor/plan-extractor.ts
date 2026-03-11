import type { PlanItem } from '@/lib/types/fiche'

interface JSONContent {
  type?: string
  attrs?: Record<string, unknown>
  content?: JSONContent[]
  text?: string
  marks?: { type: string; attrs?: Record<string, unknown> }[]
}

function extractText(node: JSONContent): string {
  if (node.text) return node.text
  if (!node.content) return ''
  return node.content.map(extractText).join('')
}

export function extractPlan(content: JSONContent): PlanItem[] {
  const sections: PlanItem[] = []

  function walk(node: JSONContent) {
    if (node.type === 'sectionBlock') {
      const header = node.content?.find((c) => c.type === 'sectionHeader')
      if (header) {
        sections.push({
          number: (node.attrs?.sectionNumber as number) ?? sections.length + 1,
          title: extractText(header),
          subtitle: (header.attrs?.subtitle as string) ?? '',
        })
      }
    }
    node.content?.forEach(walk)
  }

  walk(content)
  return sections
}
