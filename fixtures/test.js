// eslint-disable-next-line ava/no-ignored-test-files
import process from 'node:process';
import test from 'ava';

test('Dummy test', t => {
	console.error(process.argv[2]);
	t.pass();
});
