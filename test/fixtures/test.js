/* eslint-disable ava/no-ignored-test-files, ava/no-useless-t-pass -- This is not a test of this package, but an npm binary run by the `preferLocal` tests */
import process from 'node:process';
import test from 'ava';

test('Dummy test', t => {
	console.error(process.argv[2]);
	t.pass();
});
