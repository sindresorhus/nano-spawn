import {getContext} from './context.js';
import {getOptions} from './options.js';
import {spawnSubprocess} from './spawn.js';
import {getResult} from './result.js';
import {handlePipe} from './pipe.js';
import {lineIterator, combineAsyncIterators} from './iterable.js';

export default function nanoSpawn(first, second = [], third = {}) {
	const [file, previous] = Array.isArray(first) ? first : [first, {}];
	const [commandArguments, options] = Array.isArray(second) ? [second, third] : [[], second];

	const context = getContext(previous, [file, ...commandArguments]);
	const spawnOptions = getOptions(options);
	const nodeChildProcess = spawnSubprocess(file, commandArguments, spawnOptions, context);
	let subprocess = getResult(nodeChildProcess, spawnOptions, context);
	Object.assign(subprocess, {nodeChildProcess});
	subprocess = previous.subprocess === undefined ? subprocess : handlePipe(previous, subprocess);

	const stdout = lineIterator(subprocess, context, 'stdout');
	const stderr = lineIterator(subprocess, context, 'stderr');
	return Object.assign(subprocess, {
		stdout,
		stderr,
		[Symbol.asyncIterator]: () => combineAsyncIterators(stdout, stderr),
		pipe: (file, second, third) => nanoSpawn([file, {...context, subprocess}], second, third),
	});
}
