import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { LatexNodeView } from '@/components/editor/LatexNode'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    latexNode: {
      insertLatex: (formula?: string) => ReturnType
    }
  }
}

export const LatexNode = Node.create({
  name: 'latexNode',
  group: 'inline',
  inline: true,
  atom: true,

  addAttributes() {
    return {
      formula: { default: 'x^2' },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-type="latex"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, { 'data-type': 'latex' }),
    ]
  },

  addCommands() {
    return {
      insertLatex:
        (formula = 'x^2') =>
        ({ chain }) => {
          return chain()
            .insertContent({
              type: this.name,
              attrs: { formula },
            })
            .run()
        },
    }
  },

  addNodeView() {
    return ReactNodeViewRenderer(LatexNodeView)
  },
})
