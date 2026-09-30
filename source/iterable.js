import * as readline from 'node:readline/promises';

export const lineIterator = (subprocess, {state}, streamName, index) => {
	let closeReader = () => {};

	return (async function * () {
		// The `subprocess` promise is observed before anything can throw, for two reasons:
		//  - If the iteration is refused below, the `finally` block is not reached, so a rejected promise would be reported as an unhandled rejection.
		//    See https://github.com/sindresorhus/nano-spawn/issues/104
		//  - A failing subprocess can leave its streams open, for example when another stream broke. Closing the reader then ends the iteration, so the `finally` block reports the error instead of waiting for a line which can never come.
		subprocess.catch(() => {
			closeReader();
		});

		// Prevent buffering when iterating.
		// This would defeat one of the main goals of iterating: low memory consumption.
		if (state.isIterating[streamName] === false) {
			throw new Error(`The subprocess must be iterated right away, for example:
	for await (const line of spawn(...)) { ... }`);
		}

		state.isIterating[streamName] = true;

		try {
			const nodeChildProcess = await subprocess.nodeChildProcess;
			const stream = nodeChildProcess[streamName];
			if (!stream) {
				state.nonIterable[index] = true;
				const message = state.nonIterable.every(Boolean)
					? 'either the option `stdout` or `stderr`'
					: `the option \`${streamName}\``;
				throw new TypeError(
					`The subprocess cannot be iterated unless ${message} is 'pipe'.`,
				);
			}

			// Closing the reader ends the iteration, but the lines it already read are still yielded
			const reader = readline.createInterface({input: stream})[Symbol.asyncIterator]();
			closeReader = () => reader.return();
			yield * reader;
		} finally {
			await subprocess;
		}
	})();
};

// Merge two async iterators into one.
// An error is only thrown once every iterator is done. Otherwise, the lines the other iterator already read would be lost, for example when one stream ends with the subprocess failure while the other one is still being consumed.
export const combineAsyncIterators = async function * ({state}, ...iterators) {
	// The pending iterators are keyed by their stream index. Each one is moved last when it produces a value, so neither can starve the other.
	const pending = new Map(iterators.map((iterator, index) => [index, getNext(iterator, index, state)]));
	let failure;

	try {
		while (pending.size > 0) {
			// eslint-disable-next-line no-await-in-loop
			const {index, value, done, error} = await Promise.race(pending.values());
			pending.delete(index);

			if (done) {
				failure ??= error;
				continue;
			}

			pending.set(index, getNext(iterators[index], index, state));
			yield value;
		}
	} finally {
		await Promise.all(pending.keys().map(index => iterators[index].return()));
	}

	if (failure !== undefined) {
		throw failure;
	}
};

const getNext = async (iterator, index, {nonIterable}) => {
	try {
		const {value, done} = await iterator.next();
		return {index, value, done};
	} catch (error) {
		return {index, done: true, error: shouldIgnoreError(nonIterable, index) ? undefined : error};
	}
};

// When only one stream cannot be iterated, its error is ignored, so the other stream is iterated. When neither can, only the last error is thrown.
// A stream which cannot be iterated still waits for the subprocess, so a subprocess failure is thrown by the other stream, or by the last one.
const shouldIgnoreError = (nonIterable, index) => nonIterable.every(Boolean)
	? index !== nonIterable.length - 1
	: nonIterable[index];
