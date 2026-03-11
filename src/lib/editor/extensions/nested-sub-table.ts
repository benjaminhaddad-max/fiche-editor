import { Node, mergeAttributes } from '@tiptap/core'

export const NestedSubTable = Node.create({
  name: 'nestedSubTable',
  group: 'block',
  content: 'nestedSubRow+',
  isolating: true,

  parseHTML() {
    return [{ tag: 'div[data-type="nested-sub-table"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'nested-sub-table',
        class: 'nested-sub-table',
      }),
      0,
    ]
  },
})

export const NestedSubRow = Node.create({
  name: 'nestedSubRow',
  content: 'nestedSubLabel nestedSubContent',
  isolating: true,

  parseHTML() {
    return [{ tag: 'div[data-type="nested-sub-row"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'nested-sub-row',
        class: 'nested-sub-row',
      }),
      0,
    ]
  },
})

export const NestedSubLabel = Node.create({
  name: 'nestedSubLabel',
  content: 'inline*',
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-type="nested-sub-label"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'nested-sub-label',
        class: 'nested-sub-label',
      }),
      0,
    ]
  },
})

export const NestedSubContent = Node.create({
  name: 'nestedSubContent',
  content: 'block+',
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-type="nested-sub-content"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'nested-sub-content',
        class: 'nested-sub-content',
      }),
      0,
    ]
  },
})
