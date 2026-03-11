import BulletList from '@tiptap/extension-bullet-list'

export type BulletStyle = 'disc' | 'circle' | 'square' | 'dash'

export const CustomBulletList = BulletList.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      bulletStyle: {
        default: 'disc',
        parseHTML: (element) => element.getAttribute('data-bullet-style') || 'disc',
        renderHTML: (attributes) => ({
          'data-bullet-style': attributes.bulletStyle,
        }),
      },
    }
  },

  addCommands() {
    return {
      ...this.parent?.(),
      setBulletStyle:
        (style: BulletStyle) =>
        ({ commands, editor }) => {
          // If not in a bullet list, create one with this style
          if (!editor.isActive('bulletList')) {
            return commands.toggleBulletList() && commands.updateAttributes('bulletList', { bulletStyle: style })
          }
          // Otherwise just update the style
          return commands.updateAttributes('bulletList', { bulletStyle: style })
        },
    }
  },
})

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    customBulletList: {
      setBulletStyle: (style: BulletStyle) => ReturnType
    }
  }
}
