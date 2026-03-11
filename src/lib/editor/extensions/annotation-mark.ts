import { Mark, mergeAttributes } from '@tiptap/core'

export type AnnotationType = 'notion-nouvelle' | 'tombee-concours' | 'astuce'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    annotation: {
      setAnnotation: (type: AnnotationType) => ReturnType
      toggleAnnotation: (type: AnnotationType) => ReturnType
      unsetAnnotation: () => ReturnType
    }
  }
}

export const AnnotationMark = Mark.create({
  name: 'annotation',

  addAttributes() {
    return {
      type: {
        default: 'notion-nouvelle' as AnnotationType,
        parseHTML: (el) => el.getAttribute('data-annotation-type'),
        renderHTML: (attrs) => ({ 'data-annotation-type': attrs.type }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-annotation-type]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        class: `annotation annotation-${HTMLAttributes['data-annotation-type']}`,
      }),
      0,
    ]
  },

  addCommands() {
    return {
      setAnnotation:
        (type: AnnotationType) =>
        ({ commands }) => {
          return commands.setMark(this.name, { type })
        },
      toggleAnnotation:
        (type: AnnotationType) =>
        ({ commands }) => {
          return commands.toggleMark(this.name, { type })
        },
      unsetAnnotation:
        () =>
        ({ commands }) => {
          return commands.unsetMark(this.name)
        },
    }
  },
})
