/**
 * Package-owned invariant companion for `@dsh-android/dsh-client-ui-responsive`.
 * @module @dsh-android/dsh-client-ui-responsive/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@dsh-android/dsh-client-ui-responsive'

/** Cordis companion plugin name. */
export const name = 'client-ui-responsive-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: this plugin owns no service and no cross-plugin state
 * any more (ctx.layout belongs to upstream ui-layout). Its pure decisions —
 * address parsing, the open-with suffix list, and the marker's breakpoint — are
 * asserted directly by this package's unit tests.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */