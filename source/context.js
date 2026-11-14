import process from 'node:process';
import {stripVTControlCharacters} from 'node:util';

export const getContext = raw => ({
	start: process.hrtime.bigint(),
	command: raw.map(part => getCommandPart(part)).join(' '),
	state: {
		stdout: '', stderr: '', output: '', isIterating: {__proto__: null},
	},
});

// `result.command` is meant to be logged, so control characters are made visible. Emitted raw, a single argument could span several log lines, or truncate and rewrite them in a terminal.
const namedControlCharacters = new Map([[0x09, 't'], [0x0A, 'n'], [0x0D, 'r']]);
const isControlCharacter = codePoint => codePoint < 0x20 || (codePoint >= 0x7F && codePoint <= 0x9F);
const escapeControlCharacter = codePoint => '\\'
	+ (namedControlCharacters.get(codePoint) ?? `x${codePoint.toString(16).padStart(2, '0')}`);

const getCommandPart = part => {
	let escaped = '';

	for (const character of stripVTControlCharacters(part)) {
		const codePoint = character.codePointAt(0);
		escaped += isControlCharacter(codePoint) ? escapeControlCharacter(codePoint) : character;
	}

	return /[^\w\-.\/]/v.test(escaped)
		? `'${escaped.replaceAll('\'', '\'\\\'\'')}'`
		: escaped;
};
