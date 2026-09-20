import Schema from '@deepseek-ai/schemastery'
export const name = 'dsh-startup-appearance'
export const inject = ['settings']
export const Config = Schema.object({enabled: Schema.boolean().default(true)})
export function apply(ctx, config = {}) {
  ctx.settings.register('startup-appearance', Config, {base: config, applies: 'live'})
}
