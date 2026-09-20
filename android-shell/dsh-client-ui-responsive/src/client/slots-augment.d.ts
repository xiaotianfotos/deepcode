/**
 * Runtime contract type augmentations this package's typecheck consumes.
 *
 * Upstream client packages carry their own contracts: ui-layout declares
 * `shell.overlay` and `ctx.layout`, ui-conversation declares the session header
 * seats, ui-sidebar-right declares the right Sidebar's seats, and ui-session
 * declares the session standard props. What is left here is what this package
 * itself owns — the developer-options child seat its own section declares — plus
 * the two service faces every patch effect reaches for, so the plugin does not
 * have to import a package it never calls into.
 *
 * The file must stay a module (it is, through the import below): a script-form
 * `declare module` would define a NEW module instead of merging with cordis.
 */
import type {} from '@deepseek-ai/dsh-client-ui-slots'

declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface SlotMap {
        /**
         * Android developer-options child seat. Declared by this plugin's own
         * `settings.section` entry (the ADB panel and the other shell
         * facilities mount here without opening their own navigation row), so
         * its contract lives beside the declaration.
         */
        'settings.dev.item': { kind: 'list'; scope: 'root' };
    }
}

declare module '@deepseek-ai/cordis' {
    interface Context {
        /** Slot registry: register()/inject() composition face. */
        slots: {
            register(spec: Record<string, unknown>, component: unknown): () => void;
            inject(deps: string | readonly string[], fn: (...args: unknown[]) => unknown, label?: string): void;
        };
        /** Session domain face (open/clear used by the external-file consumer). */
        sessions: {
            open(id: string): void;
            clear(): void;
        };
    }
}
