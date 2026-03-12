import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { SectionBlockView } from '@/components/editor/SectionBlock'

export const SectionBlock = Node.create({
  name: 'sectionBlock',
  group: 'block',
  content: 'sectionHeader topicRow+',
  isolating: true,
  defining: true,

  addAttributes() {
    return {
      sectionNumber: { default: 1 },
      headerColor: { default: '#1e40af' },
      labelWidth: {
        default: 160,
        parseHTML: (el: HTMLElement) => {
          const val = el.getAttribute('data-label-width')
          return val ? parseInt(val, 10) : 160
        },
        renderHTML: (attrs: Record<string, unknown>) => {
          if (attrs.labelWidth === 160) return {}
          return { 'data-label-width': attrs.labelWidth }
        },
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="section-block"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-type': 'section-block' }),
      0,
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(SectionBlockView)
  },
})
