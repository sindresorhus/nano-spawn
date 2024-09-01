import process from 'node:process';
import {fileURLToPath} from 'node:url';
import test from 'ava';
import pathKey from 'path-key';
import spawn from '../source/index.js';
import {
	isWindows,
	FIXTURES_URL,
	fixturesPath,
	nodeDirectory,
} from './helpers/main.js';
import {testString} from './helpers/arguments.js';
import {assertWindowsNonExistent} from './helpers/assert.js';
import {nodePrintArgv0} from './helpers/commands.js';

if (isWindows) {
	test('Current OS uses node.exe', t => {
		t.true(process.execPath.endsWith('\\node.exe'));
	});

	const testExe = async (t, shell) => {
		const {stdout} = await spawn(process.execPath, ['--version'], {shell});
		t.is(stdout, process.version);
	};

	test('Can run .exe file', testExe, undefined);
	test('Can run .exe file, no shell', testExe, false);
	test('Can run .exe file, shell', testExe, true);

	test('.exe does not use shell by default', async t => {
		const {stdout} = await spawn(...nodePrintArgv0, {argv0: testString});
		t.is(stdout, testString);
	});

	test('.exe can use shell', async t => {
		const {stdout} = await spawn(...nodePrintArgv0, {argv0: testString, shell: true});
		t.is(stdout, process.execPath);
	});

	const testExeDetection = async (t, execPath) => {
		const {stdout} = await spawn(execPath, ['-p', 'process.argv0'], {argv0: testString});
		t.is(stdout, testString);
	};

	test('.exe detection with explicit file extension', testExeDetection, process.execPath);
	test('.exe detection with explicit file extension, case insensitive', testExeDetection, process.execPath.toUpperCase());
	test('.exe detection with file paths without file extension', testExeDetection, process.execPath.replace('.exe', ''));
	test('.exe detection with Unix slashes', testExeDetection, process.execPath.replace('\\node.exe', '/node.exe'));

	const testPathValue = async (t, pathValue) => {
		const {stdout} = await spawn(...nodePrintArgv0, {argv0: testString, env: {[pathKey()]: pathValue}});
		t.is(stdout, testString);
	};

	test('.exe detection with custom Path', testPathValue, nodeDirectory);
	test('.exe detection with custom Path and leading ;', testPathValue, `;${nodeDirectory}`);
	test('.exe detection with custom Path and double quoting', testPathValue, `"${nodeDirectory}"`);

	const testCom = async (t, shell) => {
		const {stdout} = await spawn('tree.com', [fileURLToPath(FIXTURES_URL), '/f'], {shell});
		t.true(stdout.includes('spawnecho.cmd'));
	};

	test('Can run .com file', testCom, undefined);
	test('Can run .com file, no shell', testCom, false);
	test('Can run .com file, shell', testCom, true);

	const testCmd = async (t, shell) => {
		const {stdout} = await spawn('spawnecho.cmd', [testString], {cwd: FIXTURES_URL, shell});
		t.is(stdout, testString);
	};

	test('Can run .cmd file', testCmd, undefined);
	test('Can run .cmd file, no shell', testCmd, false);
	test('Can run .cmd file, shell', testCmd, true);

	test('Memoize .cmd file logic', async t => {
		await spawn('spawnecho.cmd', [testString], {cwd: FIXTURES_URL});
		const {stdout} = await spawn('spawnecho.cmd', [testString], {cwd: FIXTURES_URL});
		t.is(stdout, testString);
	});

	test('Uses PATHEXT by default', async t => {
		const {stdout} = await spawn('spawnecho', [testString], {cwd: FIXTURES_URL});
		t.is(stdout, testString);
	});

	test('Uses cwd as string', async t => {
		const {stdout} = await spawn('spawnecho', [testString], {cwd: fixturesPath});
		t.is(stdout, testString);
	});

	const testPathExtension = async (t, shell) => {
		const error = await t.throwsAsync(spawn('spawnecho', [testString], {
			env: {PATHEXT: '.COM'},
			cwd: FIXTURES_URL,
			shell,
		}));
		assertWindowsNonExistent(t, error, `spawnecho ${testString}`);
	};

	test('Can set PATHEXT', testPathExtension, undefined);
	test('Can set PATHEXT, no shell', testPathExtension, false);
	test('Can set PATHEXT, shell', testPathExtension, true);

	test('Escapes file when setting shell option', async t => {
		const file = '()[]%0!`';
		const {stdout} = await spawn(file, {cwd: FIXTURES_URL});
		t.is(stdout, `${file}\r\n${file}`);
	});

	const testEscape = async (t, input) => {
		const {stdout} = await spawn('spawnecho', [input], {cwd: FIXTURES_URL});
		t.is(stdout, input);
	};

	test('Escapes argument when setting shell option, "', testEscape, '"');
	test('Escapes argument when setting shell option, \\', testEscape, '\\');
	test('Escapes argument when setting shell option, \\.', testEscape, '\\.');
	test('Escapes argument when setting shell option, \\"', testEscape, '\\"');
	test('Escapes argument when setting shell option, \\\\"', testEscape, '\\\\"');
	test('Escapes argument when setting shell option, a b', testEscape, 'a b');
	test('Escapes argument when setting shell option, \'.\'', testEscape, '\'.\'');
	test('Escapes argument when setting shell option, "."', testEscape, '"."');
	test('Escapes argument when setting shell option, (', testEscape, '(');
	test('Escapes argument when setting shell option, )', testEscape, ')');
	test('Escapes argument when setting shell option, ]', testEscape, ']');
	test('Escapes argument when setting shell option, [', testEscape, '[');
	test('Escapes argument when setting shell option, %', testEscape, '%');
	test('Escapes argument when setting shell option, !', testEscape, '!');
	test('Escapes argument when setting shell option, ^', testEscape, '^');
	test('Escapes argument when setting shell option, `', testEscape, '`');
	test('Escapes argument when setting shell option, <', testEscape, '<');
	test('Escapes argument when setting shell option, >', testEscape, '>');
	test('Escapes argument when setting shell option, &', testEscape, '&');
	test('Escapes argument when setting shell option, |', testEscape, '|');
	test('Escapes argument when setting shell option, ;', testEscape, ';');
	test('Escapes argument when setting shell option, ,', testEscape, ',');
	test('Escapes argument when setting shell option, space', testEscape, ' ');
	test('Escapes argument when setting shell option, *', testEscape, '*');
	test('Escapes argument when setting shell option, ?', testEscape, '?');
	test('Escapes argument when setting shell option, é', testEscape, 'é');
	test('Escapes argument when setting shell option, empty', testEscape, '');
	test('Escapes argument when setting shell option, ()', testEscape, '()');
	test('Escapes argument when setting shell option, []', testEscape, '[]');
	test('Escapes argument when setting shell option, %1', testEscape, '%1');
	test('Escapes argument when setting shell option, %*', testEscape, '%*');
	test('Escapes argument when setting shell option, %!', testEscape, '%!');
	test('Escapes argument when setting shell option, %CD%', testEscape, '%CD%');
	test('Escapes argument when setting shell option, ^<', testEscape, '^<');
	test('Escapes argument when setting shell option, >&', testEscape, '>&');
	test('Escapes argument when setting shell option, |;', testEscape, '|;');
	test('Escapes argument when setting shell option, , space', testEscape, ', ');
	test('Escapes argument when setting shell option, !=', testEscape, '!=');
	test('Escapes argument when setting shell option, \\*', testEscape, '\\*');
	test('Escapes argument when setting shell option, ?.', testEscape, '?.');
	test('Escapes argument when setting shell option, =`', testEscape, '=`');
	test('Escapes argument when setting shell option, --help 0', testEscape, '--help 0');
	test('Escapes argument when setting shell option, "a b"', testEscape, '"a b"');
	test('Escapes argument when setting shell option, "foo|bar>baz"', testEscape, '"foo|bar>baz"');
	test('Escapes argument when setting shell option, "(foo|bar>baz|foz)"', testEscape, '"(foo|bar>baz|foz)"');

	test('Cannot run shebangs', async t => {
		const error = await t.throwsAsync(spawn('./shebang.js', {cwd: FIXTURES_URL}));
		assertWindowsNonExistent(t, error, './shebang.js');
	});
} else {
	test('Can run shebangs', async t => {
		const {stdout} = await spawn('./shebang.js', {cwd: FIXTURES_URL});
		t.is(stdout, testString);
	});
}

test('Can run Bash', async t => {
	const {stdout} = await spawn(`echo ${testString}`, {cwd: FIXTURES_URL, shell: 'bash'});
	t.is(stdout, testString);
});

test('Does not double escape shell strings', async t => {
	const {stdout} = await spawn('node -p "0"', {shell: true});
	t.is(stdout, '0');
});
