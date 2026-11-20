export function slideTitleKey(versionId: string, slideNumber: number): string;
export function effectiveSlideTitle(
  row: { slideTitles?: unknown[]; slideTitleOverrides?: Record<string, unknown> } | null | undefined,
  slideNumber: number
): string;
export function slideTitleOverridePayload(slideNumber: number, input: string): {
  slideTitleOverrides: Record<string, string>;
};
