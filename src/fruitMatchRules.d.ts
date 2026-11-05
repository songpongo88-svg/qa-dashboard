export const FRUIT_MATCH: Readonly<{version:string;pairs:number;durationMs:number;reward:number;dailyRewardLimit:number;mismatchMs:number;minimumFlipMs:number}>;
export const FRUIT_MATCH_FRUITS: readonly Readonly<{id:string;name:string;image:string}>[];
export function formatFruitTime(ms:number,precise?:boolean):string;
export function compareFruitRecords(a:{elapsedMs:number;moves:number;achievedAt:string},b:{elapsedMs:number;moves:number;achievedAt:string}):number;
export function replayFruitRound(deck:number[],trace:{card:number;at:number}[]):{won:boolean;pairs:number;moves:number;elapsedMs:number};
