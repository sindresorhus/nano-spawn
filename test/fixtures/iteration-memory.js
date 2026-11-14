import process from 'node:process';
import assert from 'node:assert/strict';
import spawn from '../../source/index.js';

const streamName = process.argv[2];
const lineCount = 100_000;
const subprocess = spawn(process.execPath, ['-e', `process.${streamName}.write('line\\n'.repeat(${lineCount})); process.stdin.resume();`]);
const {nodeChildProcess} = subprocess;
let lines = 0;

globalThis.gc();
const initialHeap = process.memoryUsage().heapUsed;

try {
	for await (const line of subprocess) {
		assert.equal(line, 'line');
		lines++;
		if (lines !== lineCount) {
			continue;
		}

		// Keep the child alive and its other stream open until after measuring retained memory.
		globalThis.gc();
		console.log(JSON.stringify({lines, retainedHeap: process.memoryUsage().heapUsed - initialHeap}));
		const {stdin} = await nodeChildProcess;
		stdin.end();
	}
} finally {
	const instance = await nodeChildProcess;
	instance.kill();
	await subprocess.catch(() => {});
}
