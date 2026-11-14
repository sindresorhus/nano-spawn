import {getContext} from './context.js';
import {getOptions} from './options.js';
import {spawnSubprocess} from './spawn.js';
import {getResult} from './result.js';
import {handlePipe} from './pipe.js';
import {lineIterator, combineAsyncIterators} from './iterable.js';

export {SubprocessError} from './result.js';

export default function spawn(file, second, third, previous) {
	// Capture caller-owned arguments before asynchronous process startup.
	const [commandArguments, options = {}] = Array.isArray(second) ? [[...second], third] : [[], second];
	const context = getContext([file, ...commandArguments]);
	const spawnOptions = getOptions(options);
	const nodeChildProcess = spawnSubprocess(file, commandArguments, spawnOptions, context);
	// The destination's input comes from the source, so its own `input` must not be written: the promise is rejected by `.pipe()` instead.
	let subprocess = getResult(nodeChildProcess, previous === undefined ? spawnOptions : {...spawnOptions, input: undefined}, context);
	Object.assign(subprocess, {nodeChildProcess});
	subprocess = previous ? handlePipe([previous, subprocess], context, spawnOptions) : subprocess;

	const stdout = lineIterator(subprocess, context, 'stdout');
	const stderr = lineIterator(subprocess, context, 'stderr');
	return Object.assign(subprocess, {
		nodeChildProcess,
		stdout,
		stderr,
		[Symbol.asyncIterator]: () => combineAsyncIterators(stdout, stderr),
		pipe: (nextFile, nextSecond, nextThird) => spawn(nextFile, nextSecond, nextThird, subprocess),
	});
}
