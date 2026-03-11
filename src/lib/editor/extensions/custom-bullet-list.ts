import BulletList from '@tiptap/extension-bullet-list'

export type BulletStyle = 'auto' | 'disc' | 'circle' | 'square' | 'dash'

export const CustomBulletList = BulletList.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      bulletStyle: {
        default: 'auto',
        parseHTML: (element) => element.getAttribute('data-bullet-style') || 'auto',
        renderHTML: (attributes) => {
          if (attributes.bulletStyle === 'auto') return {}
          return { 'data-bullet-style': attributes.bulletStyle }
        },
      },
    }
  },

  addCommands() {
    return {
      ...this.parent?.(),
      setBulletStyle:
        (style: BulletStyle) =>
        ({ commands, editor }) => {
          if (!editor.isActive('bulletList')) {
            return commands.toggleBulletList() && commands.updateAttributes('bulletList', { bulletStyle: style })
          }
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
