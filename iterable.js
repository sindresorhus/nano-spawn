export const addPromiseMethods = resultPromise => {
	const stdoutLines = lineIterator(resultPromise, 'stdout');
	const stderrLines = lineIterator(resultPromise, 'stderr');

	return Object.assign(resultPromise, {
		stdout: stdoutLines,
		stderr: stderrLines,
		[Symbol.asyncIterator]: () => combineAsyncIterators(stdoutLines, stderrLines),
	});
};

const lineIterator = async function * (resultPromise, streamName) {
	const instance = await resultPromise.nodeChildProcess;
	const stream = instance[streamName];
	if (!stream) {
		return;
	}

	try {
		let buffer = '';
		for await (const chunk of stream.iterator({destroyOnReturn: false})) {
			const lines = `${buffer}${chunk}`.split(/\r?\n/);
			buffer = lines.pop(); // Keep last line in buffer as it may not be complete
			yield * lines;
		}

		if (buffer) {
			yield buffer; // Yield any remaining data as the last line
		}
	} finally {
		await resultPromise;
	}
};

// Merge two async iterators into one
const combineAsyncIterators = async function * (...iterators) {
	try {
		let promises = [];
		while (iterators.length > 0) {
			promises = iterators.map((iterator, index) => promises[index] ?? getNext(iterator));
			// eslint-disable-next-line no-await-in-loop
			const [{value, done}, index] = await Promise.race(promises
				.map((promise, index) => Promise.all([promise, index])));

			const [iterator] = iterators.splice(index, 1);
			promises.splice(index, 1);

			if (!done) {
				iterators.push(iterator);
				yield value;
			}
		}
	} finally {
		await Promise.all(iterators.map(iterator => iterator.return?.()));
	}
};

const getNext = async iterator => {
	try {
		return await iterator.next();
	} catch (error) {
		await iterator.throw?.(error);
		throw error;
	}
};
