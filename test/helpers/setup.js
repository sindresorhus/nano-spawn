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

// On Windows in simplified chinese, the default code page is 936
// Run `chcp 65001` to change it to UTF8
// https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/chcp
export default function setup() {
	if (process.platform !== 'win32') {
		return;
	}

	const originalCodePage = getCodePage();
	if (originalCodePage === '936') {
		updateCodePage('65001');

		process.on('exit', () => {
			updateCodePage(originalCodePage);
		});
	}
}
