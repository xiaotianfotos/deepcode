import {execFileSync} from 'node:child_process'

/** Validate identity, not a developer's changing LAN address, before Fold probes. */
export function requireFoldDevice(serial) {
  if (!serial || serial.startsWith('-')) throw new Error('Pass an explicit ADB serial')
  const device = execFileSync('adb', ['-s', serial, 'shell', 'getprop', 'ro.product.device'],
    {encoding: 'utf8', timeout: 10000}).trim()
  if (device !== 'lhasa') throw new Error('This probe requires the lhasa Fold; no changes made')
}
