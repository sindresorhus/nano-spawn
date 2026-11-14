import childProcess from 'node:child_process';
import process from 'node:process';
import assert from 'node:assert/strict';
import logProcessErrors from 'log-process-errors';

const getCodePage = () => childProcess.execSync('chcp', {encoding: 'utf8'})
	.trim()
	.split(' ')
	.pop();

const updateCodePage = codePage => {
	childProcess.execSync(`chcp ${codePage}`);
	assert.strictEqual(getCodePage(), codePage);
};

// On Windows, run `chcp 65001` to change the current code page to UTF8.
// This is necessary to correctly parse non-English cmd.exe error output.
// https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/chcp
// and https://learn.microsoft.com/en-us/windows/win32/intl/code-page-identifiers
if (process.platform === 'win32') {
	const originalCodePage = getCodePage();
	if (originalCodePage !== '65001') {
		updateCodePage('65001');

		process.on('exit', () => {
			updateCodePage(originalCodePage);
		});
	}
}

// Make tests fail if any warning (such as a deprecation warning) is emitted
logProcessErrors({
	exit: true,
	onError(error) {
		throw error;
	},
});
