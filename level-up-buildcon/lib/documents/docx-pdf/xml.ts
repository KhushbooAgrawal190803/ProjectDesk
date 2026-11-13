/** A minimal XML reader for the parts of a Word file. Enough for well-formed OOXML. */

export interface XmlNode {
  name: string
  attrs: Record<string, string>
  children: XmlNode[]
  /** Set on text nodes, whose name is "#text". */
  text?: string
}

function decode(value: string): string {
  return value.replace(/&(#x[0-9a-fA-F]+|#\d+|lt|gt|amp|quot|apos);/g, (_, entity: string) => {
    if (entity === 'lt') return '<'
    if (entity === 'gt') return '>'
    if (entity === 'amp') return '&'
    if (entity === 'quot') return '"'
    if (entity === 'apos') return "'"
    const code = entity.startsWith('#x') ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10)
    return String.fromCodePoint(code)
  })
}

const ATTRIBUTE = /([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g

export function parseXml(source: string): XmlNode {
  const root: XmlNode = { name: '#document', attrs: {}, children: [] }
  const stack: XmlNode[] = [root]
  let index = 0
  while (index < source.length) {
    const open = source.indexOf('<', index)
    if (open < 0) break
    if (open > index) {
      const text = source.slice(index, open)
      stack[stack.length - 1].children.push({ name: '#text', attrs: {}, children: [], text: decode(text) })
    }
    if (source.startsWith('<?', open)) {
      index = source.indexOf('?>', open) + 2
      continue
    }
    if (source.startsWith('<!--', open)) {
      index = source.indexOf('-->', open) + 3
      continue
    }
    if (source.startsWith('<![CDATA[', open)) {
      const end = source.indexOf(']]>', open)
      stack[stack.length - 1].children.push({ name: '#text', attrs: {}, children: [], text: source.slice(open + 9, end) })
      index = end + 3
      continue
    }
    if (source.startsWith('<!', open)) {
      index = source.indexOf('>', open) + 1
      continue
    }
    const close = source.indexOf('>', open)
    if (close < 0) throw new Error('The Word file is not valid XML.')
    const tag = source.slice(open + 1, close)
    index = close + 1
    if (tag.startsWith('/')) {
      if (stack.length > 1) stack.pop()
      continue
    }
    const selfClosing = tag.endsWith('/')
    const body = selfClosing ? tag.slice(0, -1) : tag
    const space = body.search(/\s/)
    const name = space < 0 ? body : body.slice(0, space)
    const attrs: Record<string, string> = {}
    if (space >= 0) {
      for (const match of body.slice(space).matchAll(ATTRIBUTE)) attrs[match[1]] = decode(match[3] ?? match[4] ?? '')
    }
    const node: XmlNode = { name, attrs, children: [] }
    stack[stack.length - 1].children.push(node)
    if (!selfClosing) stack.push(node)
  }
  return root
}

export function child(node: XmlNode | undefined, name: string): XmlNode | undefined {
  return node?.children.find((item) => item.name === name)
}

export function childrenNamed(node: XmlNode | undefined, name: string): XmlNode[] {
  return node ? node.children.filter((item) => item.name === name) : []
}

export function attr(node: XmlNode | undefined, name: string): string | undefined {
  return node?.attrs[name]
}

export function numberAttr(node: XmlNode | undefined, name: string): number | undefined {
  const value = node?.attrs[name]
  if (value == null || value === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

/** A Word on/off property: present means on unless its value says otherwise. */
export function onOff(node: XmlNode | undefined): boolean | undefined {
  if (!node) return undefined
  const value = node.attrs['w:val']
  return !(value === 'false' || value === '0' || value === 'off')
}

/** Every descendant with this name, in document order. */
export function descendants(node: XmlNode, name: string, found: XmlNode[] = []): XmlNode[] {
  for (const item of node.children) {
    if (item.name === name) found.push(item)
    descendants(item, name, found)
  }
  return found
}
