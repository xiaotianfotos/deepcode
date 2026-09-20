export interface InputState { draft: string; draftRev: number; phase: string; occurrences?: readonly { length: number }[] }
export interface TextInsertion { text: string; span: { start: number; end: number; draftRev: number } }

/** Append using the public editor contract, preserving reference chips and concurrent edits. */
export function insertion(state: InputState, transcript: string): TextInsertion | undefined {
  const text = transcript.trim()
  if (!text || state.phase !== 'plain') return undefined
  const prefix = state.draft && !/\s$/.test(state.draft) ? '\n' : ''
  // InputState.draft expands chips to clipboardText; TokenSpan counts each chip
  // as one U+FFFC. Fold the document end using the published occurrence lengths.
  const end = state.draft.length - (state.occurrences ?? []).reduce((sum, ref) => sum + ref.length - 1, 0)
  if (!Number.isInteger(end) || end < 0) return undefined
  return { text: prefix + text, span: { start: end, end, draftRev: state.draftRev } }
}
