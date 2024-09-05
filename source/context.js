import process from 'node:process';
import {stripVTControlCharacters} from 'node:util';

export const getContext = ({start, command}, raw) => ({
	start: start ?? process.hrtime.bigint(),
	command: [
		command,
		raw.map(part => getCommandPart(stripVTControlCharacters(part))).join(' '),
	].filter(Boolean).join(' | '),
	state: {stdout: '', stderr: '', output: ''},
});

const getCommandPart = part => /[^\w./-]/.test(part)
	? `'${part.replaceAll('\'', '\'\\\'\'')}'`
	: part;
