export type ShellResult = { ok: boolean; stdout: string; guidance?: string }
export type Shell = (command: string) => Promise<ShellResult>
export const IME_ID = 'com.dsharnessmobile.shell/.AdbKeyboardService'
const quote = (s: string) => "'" + s.replace(/'/g, "'\\''") + "'"
const component = /^[A-Za-z0-9_.]+\/[A-Za-z0-9_.$]+$/

/** Serialize IME loans within this plugin; restoration runs even after injection throws. */
export function createImeInput(shell: Shell) {
  let tail: Promise<unknown> = Promise.resolve()
  return (text: string, clear: boolean): Promise<ShellResult> => {
    const run = async (): Promise<ShellResult> => {
      const read = async () => {
        const r = await shell('settings get secure default_input_method')
        const id = r.stdout.trim()
        if (!r.ok || !component.test(id)) throw new Error('无法读取原输入法，未切换')
        return id
      }
      const checked = async (cmd: string) => {
        const r = await shell(cmd)
        if (!r.ok || /Error|Exception|Unknown input method|not found/i.test(r.stdout)) throw new Error(r.guidance || r.stdout || '输入通道执行失败')
        return r
      }
      let prev = '', attempted = false, failure = '', restoreFailure = ''
      try {
        prev = await read()
        if (prev === IME_ID) throw new Error('当前默认是自动化输入法，无法确定用户原输入法；请先在系统选择常用输入法')
        await checked(`ime enable ${IME_ID}`)
        attempted = true
        await checked(`ime set ${IME_ID}`)
        if (await read() !== IME_ID) throw new Error('自动化输入法切换未生效')
        if (clear) await checked('am broadcast -a ADB_CLEAR_TEXT')
        if (text) await checked(`am broadcast -a ADB_INPUT_TEXT --es msg ${quote(text)}`)
      } catch (error) { failure = String((error as Error).message) }
      finally {
        if (attempted) {
          try {
            // Do not overwrite an input method the user selected during injection.
            if (await read() === IME_ID) await checked(`sleep 0.4; ime set ${quote(prev)}`)
            if (await read() === IME_ID) throw new Error('仍为自动化输入法')
          } catch (error) { restoreFailure = `输入法恢复失败：${String((error as Error).message)}；请在系统选择常用输入法` }
        }
      }
      return { ok: !failure && !restoreFailure, stdout: [failure, restoreFailure].filter(Boolean).join('；') || '输入广播已提交，已核验退出自动化输入法；请重新观察确认文本落地' }
    }
    const result = tail.then(run, run)
    tail = result.catch(() => {})
    return result
  }
}
