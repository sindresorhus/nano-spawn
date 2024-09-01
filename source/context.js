import process from 'node:process';
import {stripVTControlCharacters} from 'node:util';

export const getContext = (previous, rawFile, rawArguments) => {
	const start = previous.start ?? process.hrtime.bigint();
	const command = [previous.command, getCommand(rawFile, rawArguments)].filter(Boolean).join(' | ');
	return {start, command, state: {stdout: '', stderr: '', output: ''}};
};

const getCommand = (rawFile, rawArguments) => [rawFile, ...rawArguments]
	.map(part => getCommandPart(part))
	.join(' ');

const getCommandPart = part => {
	part = stripVTControlCharacters(part);
	return /[^\w./-]/.test(part)
		? `'${part.replaceAll('\'', '\'\\\'\'')}'`
		: part;
};
