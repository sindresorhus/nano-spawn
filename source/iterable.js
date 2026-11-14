import * as readline from 'node:readline/promises';
import {on} from 'node:events';

export const lineIterator = async function * (subprocess, {state}, streamName) {
	// The `subprocess` promise is observed before anything can throw. If the iteration is refused below, the `finally` block is not reached, so a rejected promise would be reported as an unhandled rejection.
	// See https://github.com/sindresorhus/nano-spawn/issues/104
	subprocess.catch(() => {});

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
			throw new NonIterableError(streamName);
		}

		// Closing the reader ends the iteration, but the lines it already read are still yielded
		const reader = readline.createInterface({input: stream});
		// A failing subprocess can leave its streams open, for example when another stream broke. Closing the reader then ends the iteration, so the `finally` block reports the error instead of waiting for a line which can never come.
		subprocess.catch(() => reader.close());
		try {
			yield * reader;
		} finally {
			// Close the interface to remove its input listeners. The reader can pause its input when its line queue fills. Drain any remaining output when iteration stops, so it cannot block the subprocess from exiting.
			reader.close();
			stream.resume();
		}
	} finally {
		await subprocess;
	}
};

// Merge two async iterators into one.
// An error is only thrown once every iterator is done. Otherwise, the lines the other iterator already read would be lost, for example when one stream ends with the subprocess failure while the other one is still being consumed.
export const combineAsyncIterators = async function * (...iterators) {
	// Iterator completions are queued in the order they arrive, so neither stream can starve the other.
	// Each pending `next()` has one completion handler. Repeated `Promise.race()` would retain one losing handler per line on a silent stream.
	const completions = new EventTarget();
	const results = on(completions, 'result');
	const requestNext = (iterator, index) => getNext(iterator, index).then(result => completions.dispatchEvent(new CustomEvent('result', {detail: result})));
	let remaining = iterators.length;
	const errors = [];

	try {
		for (const [index, iterator] of iterators.entries()) {
			requestNext(iterator, index);
		}

		while (remaining > 0) {
			// eslint-disable-next-line no-await-in-loop
			const completion = await results.next();
			const [event] = completion.value;
			const {index, value, done, error} = event.detail;

			if (done) {
				remaining--;
				if (error !== undefined) {
					errors.push(error);
				}

				continue;
			}

			// Wait for the consumer before requesting another line, so `return()` is not queued behind an in-flight `next()` when iteration stops.
			yield value;
			requestNext(iterators[index], index);
		}
	} finally {
		await results.return();
		await Promise.all(iterators.map(iterator => iterator.return()));
	}

	// When only one stream cannot be iterated, its error is ignored, so the other stream is iterated. When neither can, throw an error naming both streams.
	// A stream which cannot be iterated still waits for the subprocess, so a subprocess failure takes priority over missing streams.
	const failure = errors.find(error => !(error instanceof NonIterableError));
	if (failure !== undefined) {
		throw failure;
	}

	if (errors.length === iterators.length) {
		throw new NonIterableError();
	}
};

const getNext = async (iterator, index) => {
	try {
		const {value, done} = await iterator.next();
		return {index, value, done};
	} catch (error) {
		return {index, done: true, error};
	}
};

class NonIterableError extends TypeError {
	constructor(streamName) {
		const message = streamName === undefined
			? 'either the option `stdout` or `stderr`'
			: `the option \`${streamName}\``;
		super(`The subprocess cannot be iterated unless ${message} is 'pipe'.`);
	}
}
