import { Node, mergeAttributes } from '@tiptap/core'

export const SectionHeader = Node.create({
  name: 'sectionHeader',
  content: 'inline*',
  defining: true,

  addAttributes() {
    return {
      subtitle: { default: '' },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="section-header"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'section-header',
        class: 'section-header',
      }),
      0,
    ]
  },
})
