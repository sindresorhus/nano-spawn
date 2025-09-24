import childProcess from 'node:child_process';
import process from 'node:process';
import assert from 'node:assert/strict';

const getCodePage = () => childProcess.execSync('chcp', {encoding: 'utf8'})
	.trim()
	.split(' ')
	.pop();

const updateCodePage = codePage => {
	childProcess.execSync(`chcp ${codePage}`);
	assert(getCodePage() === codePage);
};

// On Windows, run `chcp 65001` to change the current code page to UTF8.
// This is necessary to correctly parse non-English cmd.exe error output.
// https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/chcp
// and https://learn.microsoft.com/en-us/windows/win32/intl/code-page-identifiers
export default function setup() {
	if (process.platform !== 'win32') {
		return;
	}

	const originalCodePage = getCodePage();
	if (originalCodePage !== '65001') {
		updateCodePage('65001');

		process.on('exit', () => {
			updateCodePage(originalCodePage);
		});
	}
}
