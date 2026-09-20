/** Default-display input coordinates, never the panel's natural wm size. */
export interface Screen { w: number; h: number; rotation: number; displayId: number }
export function parseViewport(text: string): Screen {
  for (const line of text.split('\n')) {
    if (!/Viewport\b/.test(line) || !/\bdisplayId=0(?:,|\s)/.test(line)) continue
    if (/isActive=\[0\]|isActive=false/.test(line)) continue
    const f = /logicalFrame=\[\s*0,\s*0,\s*(\d+),\s*(\d+)\s*\]/.exec(line)
    const r = /orientation=(\d+)/.exec(line)
    if (f && r && +f[1] > 0 && +f[2] > 0 && +r[1] <= 3)
      return { w: +f[1], h: +f[2], rotation: +r[1], displayId: 0 }
  }
  throw new Error('无法确认默认显示屏当前输入视口；停止坐标操作，请检查 dumpsys input（不回退到 wm size）')
}
export function pngSize(bytes: Buffer): { w: number; h: number } {
  if (bytes.length < 24 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || bytes.toString('ascii', 12, 16) !== 'IHDR') throw new Error('截图不是有效 PNG')
  const w = bytes.readUInt32BE(16), h = bytes.readUInt32BE(20)
  if (!w || !h) throw new Error('PNG 尺寸为空')
  return { w, h }
}
export function assertPoint(screen: Pick<Screen, 'w' | 'h'>, x: number, y: number) {
  if (![x, y].every(Number.isInteger) || x < 0 || y < 0 || x >= screen.w || y >= screen.h)
    throw new Error(`坐标 (${x},${y}) 超出当前屏幕 ${screen.w}x${screen.h}；请重新观察，动作未执行`)
}
export function normalizedPoint(screen: Pick<Screen, 'w' | 'h'>, nx: number, ny: number): [number, number] {
  if (![nx, ny].every(n => Number.isFinite(n) && n >= 0 && n <= 1)) throw new Error('归一化坐标必须在 0–1 内')
  return [Math.round(nx * (screen.w - 1)), Math.round(ny * (screen.h - 1))]
}
