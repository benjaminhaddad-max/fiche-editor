import { Node, mergeAttributes } from '@tiptap/core'

export const NestedSubTable = Node.create({
  name: 'nestedSubTable',
  group: 'block',
  content: 'nestedSubRow+',
  isolating: true,

  addAttributes() {
    return {
      subLabelWidth: {
        default: null,
        parseHTML: (el: HTMLElement) => {
          const val = el.getAttribute('data-sub-label-width')
          return val ? parseInt(val, 10) : null
        },
        renderHTML: (attrs: Record<string, unknown>) => {
          if (!attrs.subLabelWidth) return {}
          return { 'data-sub-label-width': attrs.subLabelWidth }
        },
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="nested-sub-table"]' }]
  },

  renderHTML({ HTMLAttributes, node }) {
    const style = node.attrs.subLabelWidth
      ? `--sub-label-width: ${node.attrs.subLabelWidth}px`
      : undefined
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'nested-sub-table',
        class: 'nested-sub-table',
        ...(style ? { style } : {}),
      }),
      0,
    ]
  },
})

export const NestedSubRow = Node.create({
  name: 'nestedSubRow',
  content: 'nestedSubLabel nestedSubContent',
  isolating: true,

  addAttributes() {
    return {
      subRowMinHeight: {
        default: null,
        parseHTML: (el: HTMLElement) => {
          const val = el.getAttribute('data-sub-row-min-height')
          return val ? parseInt(val, 10) : null
        },
        renderHTML: (attrs: Record<string, unknown>) => {
          if (!attrs.subRowMinHeight) return {}
          return { 'data-sub-row-min-height': attrs.subRowMinHeight }
        },
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="nested-sub-row"]' }]
  },

  renderHTML({ HTMLAttributes, node }) {
    const style = node.attrs.subRowMinHeight
      ? `min-height: ${node.attrs.subRowMinHeight}px`
      : undefined
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'nested-sub-row',
        class: 'nested-sub-row',
        ...(style ? { style } : {}),
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
