export function streamToIterable(stream) {
	return {
		[Symbol.asyncIterator]: stream[Symbol.asyncIterator].bind(stream),
	};
}

export async function * combineAsyncIterables(iterable1, iterable2) {
	const iterator1 = iterable1[Symbol.asyncIterator]();
	const iterator2 = iterable2[Symbol.asyncIterator]();

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
		buffer += chunk;
		const lines = buffer.split('\n');
		buffer = lines.pop(); // Keep last line in buffer as it may not be complete
		for (const line of lines) {
			yield line;
		}
	}

	if (buffer) {
		yield buffer; // Yield any remaining data as the last line
	}
}
