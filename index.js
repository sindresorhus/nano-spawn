import process from 'node:process';
import {normalizeArguments, getCommand, spawnProcess} from './spawn.js';

export default function nanoSpawn(file, commandArguments, options) {
	[commandArguments, options] = normalizeArguments(commandArguments, options);
	const start = process.hrtime.bigint();
	const command = getCommand(file, commandArguments);
	return spawnProcess({
		file,
		commandArguments,
		options,
		start,
		command,
	});
}
