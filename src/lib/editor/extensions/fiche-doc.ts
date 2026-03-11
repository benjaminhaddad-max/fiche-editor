import { Node } from '@tiptap/core'

// Override the default Doc node to only allow sectionBlocks
// This prevents users from typing free text outside of sections
export const FicheDoc = Node.create({
  name: 'doc',
  topNode: true,
  content: 'sectionBlock+',
})
