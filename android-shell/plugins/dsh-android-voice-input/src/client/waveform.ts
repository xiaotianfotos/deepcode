// Adapted from Homerail AgentVoiceCockpit.vue (308f652): signed PCM, three quadratic SVG curves.
export function buildVoiceWavePath(
  values: number[],
  energy: number,
  verticalOffset: number,
  scale: number,
  shift: number
): string {
  const width = 360
  const centerY = 38 + verticalOffset
  const usable = Math.max(2, values.length - 1)
  const points = values.map((value, index) => {
    const x = (index / usable) * width
    const sample = values[(index + shift) % values.length] ?? value
    const sample2 = values[(index + shift + 5) % values.length] ?? value
    const signed = Math.max(-1, Math.min(1, sample * 0.82 + sample2 * 0.18))
    const envelope = 0.28 + Math.sin((index / usable) * Math.PI) * 0.72
    const amplitude = (18 + energy * 92) * envelope * scale
    return { x, y: centerY + signed * amplitude }
  })
  if (!points.length) return `M 0 ${centerY} L ${width} ${centerY}`
  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]
    const current = points[index]
    const midX = (previous.x + current.x) / 2
    const midY = (previous.y + current.y) / 2
    d += ` Q ${previous.x.toFixed(1)} ${previous.y.toFixed(1)} ${midX.toFixed(1)} ${midY.toFixed(1)}`
  }
  const last = points[points.length - 1]
  d += ` T ${last.x.toFixed(1)} ${last.y.toFixed(1)}`
  return d
}
