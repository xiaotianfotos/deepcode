import { ReactNode } from "react";

//#region src/contracts.d.ts
/** One import implementation contributed by a provider plugin. */
interface SessionImportProviderDescriptor {
  /** Stable provider identity, also used as the menu item id. */
  id: string;
  /** Localized menu label, for example "Import from Codex". */
  label: string;
  /** Provider mark shown beside the explicit menu label. */
  icon: ReactNode;
  /** Deterministic menu ordering; lower values render first. */
  order?: number;
  /** Open the provider-owned import flow. */
  open: () => void;
}
/** Owner share passed by the hub to each renderless provider contribution. */
interface SessionImportProviderOwnerProps {
  /** Register while mounted and dispose the exact registration on unmount. */
  registerProvider: (provider: SessionImportProviderDescriptor) => () => void;
}
/** Canonical slot definition consumers merge into their local DSH type graph. */
interface SessionImportProviderSlotDefinition {
  kind: 'list';
  scope: 'root';
  owner: SessionImportProviderOwnerProps;
}
//#endregion
export { SessionImportProviderDescriptor, SessionImportProviderOwnerProps, SessionImportProviderSlotDefinition };
//# sourceMappingURL=contracts.d.ts.map