export const lineIterator = async function * (resultPromise, {state, spawnOptions: {binary}}, streamName) {
	// Prevent buffering when iterating.
	// This would defeat one of the main goals of iterating: low memory consumption.
	if (state.isIterating === false) {
		throw new Error(`The subprocess must be iterated right away, for example:
	for await (const line of nanoSpawn(...)) { ... }`);
	}

	state.isIterating = true;
	const instance = await resultPromise.nodeChildProcess;
	const stream = instance[streamName];
	if (!stream) {
		return;
	}

	try {
		let buffer = '';
		for await (const chunk of stream.iterator({destroyOnReturn: false})) {
			if (binary) {
				yield new Uint8Array(chunk);
			} else {
				const lines = `${buffer}${chunk}`.split(/\r?\n/);
				buffer = lines.pop(); // Keep last line in buffer as it may not be complete
				yield * lines;
			}
		}

		if (buffer) {
			yield buffer; // Yield any remaining data as the last line
		}
	} finally {
		await resultPromise;
	}
};

// Merge two async iterators into one
export const combineAsyncIterators = async function * (...iterators) {
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
