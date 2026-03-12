import { toRoman } from './utils'

interface JSONContent {
  type?: string
  attrs?: Record<string, unknown>
  content?: JSONContent[]
  text?: string
  marks?: { type: string; attrs?: Record<string, unknown> }[]
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function renderMarks(text: string, marks?: JSONContent['marks']): string {
  if (!marks || marks.length === 0) return escapeHtml(text)

  let result = escapeHtml(text)
  for (const mark of marks) {
    switch (mark.type) {
      case 'bold':
        result = `<strong>${result}</strong>`
        break
      case 'italic':
        result = `<em>${result}</em>`
        break
      case 'underline':
        result = `<u>${result}</u>`
        break
      case 'textStyle': {
        const styles: string[] = []
        if (mark.attrs?.color) styles.push(`color:${mark.attrs.color}`)
        if (mark.attrs?.fontFamily) styles.push(`font-family:${mark.attrs.fontFamily}`)
        if (mark.attrs?.fontSize) styles.push(`font-size:${mark.attrs.fontSize}`)
        if (styles.length > 0) {
          result = `<span style="${styles.join(';')}">${result}</span>`
        }
        break
      }
      case 'highlight':
        if (mark.attrs?.color) {
          result = `<mark style="background-color:${mark.attrs.color}">${result}</mark>`
        }
        break
      case 'annotation': {
        const iconMap: Record<string, string> = {
          'notion-nouvelle': '\u26A1',
          'tombee-concours': '\uD83C\uDFAF',
          'astuce': '\uD83D\uDCA1',
        }
        const type = mark.attrs?.type as string
        const icon = iconMap[type] || ''
        result = `<span class="pdf-annotation pdf-annotation-${type}">${icon} ${result}</span>`
        break
      }
    }
  }
  return result
}

function renderInline(node: JSONContent): string {
  if (node.text) return renderMarks(node.text, node.marks)
  if (!node.content) return ''
  return node.content.map(renderInline).join('')
}

function renderNode(node: JSONContent): string {
  switch (node.type) {
    case 'doc':
      return node.content?.map(renderNode).join('') ?? ''

    case 'sectionBlock': {
      const num = (node.attrs?.sectionNumber as number) ?? 1
      const color = (node.attrs?.headerColor as string) ?? '#374151'
      const labelWidth = node.attrs?.labelWidth as number | undefined
      const header = node.content?.find((c) => c.type === 'sectionHeader')
      const rows = node.content?.filter((c) => c.type === 'topicRow') ?? []

      const titleNode = header?.content?.find((c) => c.type === 'sectionTitle')
      const subtitleNode = header?.content?.find((c) => c.type === 'sectionSubtitle')
      const titleText = titleNode ? renderBlockContent(titleNode) : ''
      const subtitleText = subtitleNode ? renderBlockContent(subtitleNode) : ''

      const sectionStyle = labelWidth && labelWidth !== 160
        ? ` style="--label-width:${labelWidth}px"`
        : ''

      return `
        <div class="pdf-section"${sectionStyle}>
          <div class="pdf-section-header" style="background-color:${color}">
            <div class="pdf-section-num">${toRoman(num)}. ${titleText}</div>
            ${subtitleText ? `<div class="pdf-section-subtitle">${subtitleText}</div>` : ''}
          </div>
          <div class="pdf-section-body">
            ${rows.map(renderNode).join('')}
          </div>
        </div>`
    }

    case 'topicRow': {
      const label = node.content?.find((c) => c.type === 'topicLabel')
      const content = node.content?.find((c) => c.type === 'topicContent')
      const labelBg = label?.attrs?.backgroundColor ? ` style="background-color:${label.attrs.backgroundColor}"` : ''
      const contentBg = content?.attrs?.backgroundColor ? ` style="background-color:${content.attrs.backgroundColor}"` : ''
      const rowMinHeight = node.attrs?.rowMinHeight as number | undefined
      const rowStyle = rowMinHeight ? ` style="min-height:${rowMinHeight}px"` : ''
      return `
        <div class="pdf-topic-row"${rowStyle}>
          <div class="pdf-topic-label"${labelBg}>${label ? renderBlockContent(label) : ''}</div>
          <div class="pdf-topic-content"${contentBg}>${content ? renderBlockContent(content) : ''}</div>
        </div>`
    }

    case 'nestedSubTable': {
      const subLabelWidth = node.attrs?.subLabelWidth as number | undefined
      const tableStyle = subLabelWidth ? ` style="--sub-label-width:${subLabelWidth}px"` : ''
      return `
        <div class="pdf-sub-table"${tableStyle}>
          ${node.content?.map(renderNode).join('') ?? ''}
        </div>`
    }

    case 'nestedSubRow': {
      const label = node.content?.find((c) => c.type === 'nestedSubLabel')
      const content = node.content?.find((c) => c.type === 'nestedSubContent')
      const subRowMinHeight = node.attrs?.subRowMinHeight as number | undefined
      const subRowStyle = subRowMinHeight ? ` style="min-height:${subRowMinHeight}px"` : ''
      return `
        <div class="pdf-sub-row"${subRowStyle}>
          <div class="pdf-sub-label">${label ? renderBlockContent(label) : ''}</div>
          <div class="pdf-sub-content">${content ? renderBlockContent(content) : ''}</div>
        </div>`
    }

    case 'paragraph':
      return `<p>${renderInline(node)}</p>`

    case 'bulletList':
      return `<ul>${node.content?.map(renderNode).join('') ?? ''}</ul>`

    case 'orderedList':
      return `<ol>${node.content?.map(renderNode).join('') ?? ''}</ol>`

    case 'listItem': {
      const bulletLevel = (node.attrs?.bulletLevel as number) ?? 0
      const levelAttr = bulletLevel > 0 ? ` data-bullet-level="${bulletLevel}"` : ''
      return `<li${levelAttr}>${node.content?.map(renderNode).join('') ?? ''}</li>`
    }

    case 'hardBreak':
      return '<br />'

    default:
      if (node.content) return node.content.map(renderNode).join('')
      if (node.text) return renderMarks(node.text, node.marks)
      return ''
  }
}

function renderBlockContent(node: JSONContent): string {
  if (!node.content) return ''
  return node.content.map(renderNode).join('')
}

export function serializeToHtml(content: JSONContent): string {
  return renderNode(content)
}
