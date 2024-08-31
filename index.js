import process from 'node:process';
import {normalizeArguments, getCommand, spawnProcess} from './spawn.js';
import {addPromiseMethods} from './iterable.js';

export default function nanoSpawn(file, commandArguments, options) {
	[commandArguments, options] = normalizeArguments(commandArguments, options);
	const context = {
		start: process.hrtime.bigint(),
		command: getCommand(file, commandArguments),
	};
	const resultPromise = spawnProcess(file, commandArguments, options, context);
	return addPromiseMethods(resultPromise);
}
