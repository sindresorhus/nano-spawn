export type Options = {
	readonly timeout: number;
	readonly signal: AbortSignal;
	// Readonly nativeOptions;
};

// TODO: Finish this when the API is decided on.
export function nanoSpawn(
	command: string,
	arguments: readonly string[],
	options?: Options
): Promise<void>;
