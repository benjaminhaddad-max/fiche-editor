import { Node, mergeAttributes } from '@tiptap/core'

// Container node: renders as the dark bar with 2 columns via CSS grid
// No NodeView needed — pure renderHTML + CSS handles the layout
export const SectionHeader = Node.create({
  name: 'sectionHeader',
  content: 'sectionTitle sectionSubtitle',
  defining: true,

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

// Left part: "I. Introduction au tissu sanguin"
export const SectionTitle = Node.create({
  name: 'sectionTitle',
  content: 'inline*',
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-type="section-title"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'section-title',
        class: 'section-title',
      }),
      0,
    ]
  },
})

// Right part: "Composition et Caractéristiques"
export const SectionSubtitle = Node.create({
  name: 'sectionSubtitle',
  content: 'inline*',
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-type="section-subtitle"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'section-subtitle',
        class: 'section-subtitle',
      }),
      0,
    ]
  },
})
