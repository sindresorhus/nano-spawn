export async function * combineAsyncIterators(iterator1, iterator2) {
	while (true) {
		// eslint-disable-next-line no-await-in-loop
		const [result1, result2] = await Promise.all([
			iterator1.next(),
			iterator2.next(),
		]);

		if (result1.done && result2.done) {
			break;
		}

		if (!result1.done) {
			yield result1.value;
		}

		if (!result2.done) {
			yield result2.value;
		}
	}
}

export async function * lineIterator(iterable) {
	let buffer = '';
	for await (const chunk of iterable) {
		const lines = `${buffer}${chunk}`.split(/\r?\n/);
		buffer = lines.pop(); // Keep last line in buffer as it may not be complete
		yield * lines;
	}

	if (buffer) {
		yield buffer; // Yield any remaining data as the last line
	}
}
