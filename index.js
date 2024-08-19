import {spawn} from 'node:child_process';
import {lineIterator, combineAsyncIterables} from './utilities.js';

export default function nanoSpawn(command, arguments_ = [], {signal, timeout, nativeOptions} = {}) {
	const subprocess = spawn(command, arguments_, {...nativeOptions, signal, timeout});

	// eslint-disable-next-line no-async-promise-executor
	const promise = new Promise(async (resolve, reject) => {
		try {
			subprocess.on('close', exitCode => {
				// TODO: Pass in `stdin` and `stdout` strings here.
				resolve({
					exitCode,
				});
			});

			subprocess.on('error', error => {
				reject(error);
			});
		} catch (error) {
			reject(error);
		}
	});

	const stdoutLines = lineIterator(subprocess.stdout);
	const stderrLines = lineIterator(subprocess.stderr);

	return {
		[Symbol.asyncIterator]: () => combineAsyncIterables(stdoutLines, stderrLines),
		stdout: stdoutLines,
		stderr: stderrLines,
		/* eslint-disable promise/prefer-await-to-then */
		then(onFulfilled, onRejected) { // eslint-disable-line unicorn/no-thenable
			return promise.then(onFulfilled, onRejected);
		},
		catch(onRejected) {
			return promise.catch(onRejected);
		},
		finally(onFinally) {
			return promise.finally(onFinally);
		},
		/* eslint-enable promise/prefer-await-to-then */
	};
}
