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
	const resultPromise = getResult(nodeChildProcess, spawnOptions, context);
	Object.assign(resultPromise, {nodeChildProcess});
	const finalPromise = previous.resultPromise === undefined ? resultPromise : handlePipe(previous, resultPromise);

	const stdoutLines = lineIterator(finalPromise, context, 'stdout');
	const stderrLines = lineIterator(finalPromise, context, 'stderr');
	return Object.assign(finalPromise, {
		stdout: stdoutLines,
		stderr: stderrLines,
		[Symbol.asyncIterator]: () => combineAsyncIterators(stdoutLines, stderrLines),
		pipe: (file, second, third) => nanoSpawn([file, {...context, resultPromise: finalPromise}], second, third),
	});
}
