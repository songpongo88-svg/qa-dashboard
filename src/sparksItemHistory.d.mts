// Shared display-only Item history projections. No network calls or mutations.
import type { SparksHistoryItem } from "./qaSparksStore";
export type ItemAuditLabel={name:string;action:string;quantity:number|null;extra:string};
export function isItemHistoryEntry(entry:unknown):boolean;
export function itemHistoryLabel(entry:unknown):ItemAuditLabel|null;
export function itemHistoryDeltaText(entry:unknown):string;
export function appendKnownItemExpirations(history:SparksHistoryItem[],wallet:unknown,now?:number):SparksHistoryItem[];
