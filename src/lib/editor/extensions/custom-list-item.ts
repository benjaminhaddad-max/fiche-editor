import ListItem from '@tiptap/extension-list-item'

export const CustomListItem = ListItem.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      bulletLevel: {
        default: 0,
        parseHTML: (element) => parseInt(element.getAttribute('data-bullet-level') || '0', 10),
        renderHTML: (attributes) => {
          if (attributes.bulletLevel === 0) return {}
          return { 'data-bullet-level': attributes.bulletLevel }
        },
      },
    }
  },

  addCommands() {
    return {
      ...this.parent?.(),
      setBulletLevel:
        (level: number) =>
        ({ commands }) => {
          return commands.updateAttributes('listItem', { bulletLevel: Math.max(0, Math.min(3, level)) })
        },
    }
  },

  addKeyboardShortcuts() {
    return {
      ...this.parent?.(),
      Tab: () => {
        if (this.editor.isActive('bulletList')) {
          const attrs = this.editor.getAttributes('listItem')
          const current = (attrs.bulletLevel as number) || 0
          if (current < 3) {
            return this.editor.commands.setBulletLevel(current + 1)
          }
          return true
        }
        return false
      },
      'Shift-Tab': () => {
        if (this.editor.isActive('bulletList')) {
          const attrs = this.editor.getAttributes('listItem')
          const current = (attrs.bulletLevel as number) || 0
          if (current > 0) {
            return this.editor.commands.setBulletLevel(current - 1)
          }
        }
        return false
      },
    }
  },
})

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    customListItem: {
      setBulletLevel: (level: number) => ReturnType
    }
  }
}
