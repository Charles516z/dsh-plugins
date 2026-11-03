/**
 * Turns an assistant reply into speakable prose.
 *
 * A reply is markdown written for the eyes: fenced code, tables, links and
 * emphasis markers all sound like noise when a text-to-speech voice reads them
 * one character at a time. `stripForSpeech` removes those constructs, and
 * `chunkForSpeech` cuts the remainder at sentence boundaries so each utterance
 * stays short enough for a single PowerShell invocation.
 */

const FENCED_CODE = /```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)/g
const INLINE_CODE = /`[^`\n]*`/g
const IMAGE = /!\[[^\]]*\]\([^)]*\)/g
const LINK = /\[([^\]]+)\]\([^)]*\)/g
const AUTOLINK = /<https?:\/\/[^>\s]+>/g
const BARE_URL = /https?:\/\/\S+/g
const TABLE_ROW = /^[ \t]*\|.*\|[ \t]*$/gm
const HEADING = /^[ \t]*#{1,6}[ \t]+/gm
const BLOCKQUOTE = /^[ \t]*>[ \t]?/gm
const BULLET = /^[ \t]*[-*+][ \t]+/gm
const ORDERED = /^[ \t]*\d+[.)][ \t]+/gm
const RULE = /^[ \t]*([-*_])(?:[ \t]*\1){2,}[ \t]*$/gm
const HTML_TAG = /<\/?[a-zA-Z][^>\n]*>/g
const EMPHASIS = /(\*\*|__|\*|_|~~)/g

/** Markdown in, plain prose out. Never throws: a broken reply just yields less text. */
export function stripForSpeech(markdown) {
  let text = String(markdown ?? '')
  if (text === '') return ''
  text = text.replace(/\r\n/g, '\n')
  text = text.replace(FENCED_CODE, ' ')
  text = text.replace(INLINE_CODE, ' ')
  text = text.replace(IMAGE, ' ')
  text = text.replace(LINK, '$1')
  text = text.replace(AUTOLINK, ' ')
  text = text.replace(BARE_URL, ' ')
  text = text.replace(TABLE_ROW, ' ')
  text = text.replace(RULE, ' ')
  text = text.replace(HEADING, '')
  text = text.replace(BLOCKQUOTE, '')
  text = text.replace(BULLET, '')
  text = text.replace(ORDERED, '')
  text = text.replace(HTML_TAG, ' ')
  text = text.replace(EMPHASIS, '')
  text = text.replace(/\s+/g, ' ').trim()
  return text
}

/** Splits prose into utterances of at most `maxChars`, preferring sentence ends. */
export function chunkForSpeech(text, maxChars = 220) {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim()
  if (clean === '') return []
  const limit = Number.isFinite(maxChars) && maxChars >= 40 ? Math.round(maxChars) : 220
  const sentences = clean.match(/[^。！？!?；;…]+[。！？!?；;…]*/g) ?? [clean]
  const chunks = []
  let buffer = ''
  const flush = () => {
    if (buffer === '') return
    chunks.push(buffer)
    buffer = ''
  }
  for (const raw of sentences) {
    let piece = raw.trim()
    while (piece.length > limit) {
      flush()
      chunks.push(piece.slice(0, limit))
      piece = piece.slice(limit).trim()
    }
    if (piece === '') continue
    if (buffer !== '' && buffer.length + piece.length > limit) flush()
    buffer = buffer === '' ? piece : `${buffer} ${piece}`
  }
  flush()
  return chunks
}

/** Whole pipeline: reply markdown -> the list of utterances to say in order. */
export function buildUtterances(markdown, maxChars = 220, maxTotal = 4000) {
  const clean = stripForSpeech(markdown)
  if (clean === '') return []
  const total = Number.isFinite(maxTotal) && maxTotal > 0 ? Math.round(maxTotal) : 4000
  const text = clean.length > total ? clean.slice(0, total) : clean
  return chunkForSpeech(text, maxChars)
}
