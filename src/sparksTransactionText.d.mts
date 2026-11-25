export const REFUND_REASONS: readonly string[];
export function transactionText(entry:{title?:string;detail?:string;source?:string;reason?:string;voided?:boolean}):{title:string;detail:string};
