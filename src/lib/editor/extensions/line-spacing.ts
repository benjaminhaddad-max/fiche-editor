import { Extension } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    lineSpacing: {
      setLineHeight: (lineHeight: string) => ReturnType
      unsetLineHeight: () => ReturnType
      setSpaceBefore: (space: string) => ReturnType
      unsetSpaceBefore: () => ReturnType
      setSpaceAfter: (space: string) => ReturnType
      unsetSpaceAfter: () => ReturnType
    }
  }
}

export interface LineSpacingOptions {
  types: string[]
  defaultLineHeight: string | null
}

export const LineSpacing = Extension.create<LineSpacingOptions>({
  name: 'lineSpacing',

  addOptions() {
    return {
      types: [],
      defaultLineHeight: null,
    }
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          lineHeight: {
            default: this.options.defaultLineHeight,
            parseHTML: (element) => element.style.lineHeight || null,
            renderHTML: (attributes) => {
              if (!attributes.lineHeight) return {}
              return { style: `line-height: ${attributes.lineHeight}` }
            },
          },
          spaceBefore: {
            default: null,
            parseHTML: (element) => {
              const mt = element.style.marginTop
              return mt ? mt : null
            },
            renderHTML: (attributes) => {
              if (!attributes.spaceBefore) return {}
              return { style: `margin-top: ${attributes.spaceBefore}` }
            },
          },
          spaceAfter: {
            default: null,
            parseHTML: (element) => {
              const mb = element.style.marginBottom
              return mb ? mb : null
            },
            renderHTML: (attributes) => {
              if (!attributes.spaceAfter) return {}
              return { style: `margin-bottom: ${attributes.spaceAfter}` }
            },
          },
        },
      },
    ]
  },

  addCommands() {
    return {
      setLineHeight:
        (lineHeight: string) =>
        ({ commands }) => {
          return this.options.types
            .map((type) => commands.updateAttributes(type, { lineHeight }))
            .some((r) => r)
        },

      unsetLineHeight:
        () =>
        ({ commands }) => {
          return this.options.types
            .map((type) => commands.resetAttributes(type, 'lineHeight'))
            .some((r) => r)
        },

      setSpaceBefore:
        (space: string) =>
        ({ commands }) => {
          return this.options.types
            .map((type) => commands.updateAttributes(type, { spaceBefore: space }))
            .some((r) => r)
        },

      unsetSpaceBefore:
        () =>
        ({ commands }) => {
          return this.options.types
            .map((type) => commands.resetAttributes(type, 'spaceBefore'))
            .some((r) => r)
        },

      setSpaceAfter:
        (space: string) =>
        ({ commands }) => {
          return this.options.types
            .map((type) => commands.updateAttributes(type, { spaceAfter: space }))
            .some((r) => r)
        },

      unsetSpaceAfter:
        () =>
        ({ commands }) => {
          return this.options.types
            .map((type) => commands.resetAttributes(type, 'spaceAfter'))
            .some((r) => r)
        },
    }
  },
})
