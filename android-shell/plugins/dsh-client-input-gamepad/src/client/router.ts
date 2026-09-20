export type Button = 'l2' | 'l1' | 'r1' | 'north' | 'west' | 'east'
export type Intent = 'sidebar' | 'previous' | 'next' | 'record' | 'delete' | 'send'
const intents: Record<Button, Intent> = {l2:'sidebar', l1:'previous', r1:'next', north:'record', west:'delete', east:'send'}
/** One owner for key edges and repeat; no device mapping enters the Deck. */
export class ButtonRouter {
  private pressed = new Set<Button>()
  private timer: ReturnType<typeof setTimeout> | undefined
  constructor(private action: (intent: Intent) => void) {}
  button(button: Button, pressed: boolean, repeat = false) {
    if (!pressed) { this.pressed.delete(button); if (button === 'west') this.stopRepeat(); return }
    if (repeat || this.pressed.has(button)) return
    this.pressed.add(button)
    this.action(intents[button])
    if (button === 'west') this.timer = setTimeout(() => this.repeat(), 450)
  }
  private repeat() {
    if (!this.pressed.has('west')) return
    this.action('delete'); this.timer = setTimeout(() => this.repeat(), 90)
  }
  stopRepeat() { if (this.timer !== undefined) clearTimeout(this.timer); this.timer = undefined }
  // Keep held keys latched across lane changes until a real key-up arrives.
  reset() { this.stopRepeat(); this.pressed.clear() }
}
