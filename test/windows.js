import process from 'node:process';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import pathKey from 'path-key';
import spawn from '../source/index.js';
import {
	isWindows,
	FIXTURES_URL,
	fixturesPath,
	nodeDirectory,
} from './helpers/main.js';
import {testString} from './helpers/arguments.js';
import {
	assertWindowsNonExistent,
	throwsAsync
} from './helpers/assert.js';
import {nodePrintArgv0} from './helpers/commands.js';

if (isWindows) {
	test('Current OS uses node.exe', t => {
		assert.ok(process.execPath.endsWith('\\node.exe'));
	});

	const testExe = (shell) => async () => {
		const {stdout} = await spawn(process.execPath, ['--version'], {shell});
		assert.equal(stdout, process.version);
	};

	test('Can run .exe file', testExe(undefined));
	test('Can run .exe file, no shell', testExe(false));
	test('Can run .exe file, shell', testExe(true));

	test('.exe does not use shell by default', async () => {
		const {stdout} = await spawn(...nodePrintArgv0, {argv0: testString});
		assert.equal(stdout, testString);
	});

	test('.exe can use shell', async () => {
		const {stdout} = await spawn(...nodePrintArgv0, {argv0: testString, shell: true});
		assert.equal(stdout, process.execPath);
	});

	const testExeDetection = (execPath) => async () => {
		const {stdout} = await spawn(execPath, ['-p', 'process.argv0'], {argv0: testString});
		assert.equal(stdout, testString);
	};

	test('.exe detection with explicit file extension', testExeDetection(process.execPath));
	test('.exe detection with explicit file extension, case insensitive', testExeDetection(process.execPath.toUpperCase()));
	test('.exe detection with file paths without file extension', testExeDetection(process.execPath.replace('.exe', '')));
	test('.exe detection with Unix slashes', testExeDetection(process.execPath.replace('\\node.exe', '/node.exe')));

	const testPathValue = (pathValue) => async () => {
		const {stdout} = await spawn(...nodePrintArgv0, {argv0: testString, env: {[pathKey()]: pathValue}});
		assert.equal(stdout, testString);
	};

	test('.exe detection with custom Path', testPathValue(nodeDirectory));
	test('.exe detection with custom Path and leading ;', testPathValue(`;${nodeDirectory}`));
	test('.exe detection with custom Path and double quoting', testPathValue(`"${nodeDirectory}"`));

	const testCom = (shell) => async () => {
		const {stdout} = await spawn('tree.com', [fileURLToPath(FIXTURES_URL), '/f'], {shell});
		assert.ok(stdout.includes('spawnecho.cmd'));
	};

	test('Can run .com file', testCom(undefined));
	test('Can run .com file, no shell', testCom(false));
	test('Can run .com file, shell', testCom(true));

	const testCmd = (shell) => async () => {
		const {stdout} = await spawn('spawnecho.cmd', [testString], {cwd: FIXTURES_URL, shell});
		assert.equal(stdout, testString);
	};

	test('Can run .cmd file', testCmd(undefined));
	test('Can run .cmd file, no shell', testCmd(false));
	test('Can run .cmd file, shell', testCmd(true));

	test('Memoize .cmd file logic', async () => {
		await spawn('spawnecho.cmd', [testString], {cwd: FIXTURES_URL});
		const {stdout} = await spawn('spawnecho.cmd', [testString], {cwd: FIXTURES_URL});
		assert.equal(stdout, testString);
	});

	test('Uses PATHEXT by default', async () => {
		const {stdout} = await spawn('spawnecho', [testString], {cwd: FIXTURES_URL});
		assert.equal(stdout, testString);
	});

	test('Uses cwd as string', async () => {
		const {stdout} = await spawn('spawnecho', [testString], {cwd: fixturesPath});
		assert.equal(stdout, testString);
	});

	const testPathExtension = (shell) => async () => {
		const error = await throwsAsync(spawn('spawnecho', [testString], {
			env: {PATHEXT: '.COM'},
			cwd: FIXTURES_URL,
			shell,
		}));
		assertWindowsNonExistent(error, `spawnecho ${testString}`);
	};

	test('Can set PATHEXT', testPathExtension(undefined));
	test('Can set PATHEXT, no shell', testPathExtension(false));
	test('Can set PATHEXT, shell', testPathExtension(true));

	test('Escapes file when setting shell option', async () => {
		const file = '()[]%0!`';
		const {stdout} = await spawn(file, {cwd: FIXTURES_URL});
		assert.equal(stdout, `${file}\r\n${file}`);
	});

	const testEscape = (input) => async () => {
		const {stdout} = await spawn('spawnecho', [input], {cwd: FIXTURES_URL});
		assert.equal(stdout, input);
	};

	test('Escapes argument when setting shell option, "', testEscape('"'));
	test('Escapes argument when setting shell option, \\', testEscape('\\'));
	test('Escapes argument when setting shell option, \\.', testEscape('\\.'));
	test('Escapes argument when setting shell option, \\"', testEscape('\\"'));
	test('Escapes argument when setting shell option, \\\\"', testEscape('\\\\"'));
	test('Escapes argument when setting shell option, a b', testEscape('a b'));
	test('Escapes argument when setting shell option, \'.\'', testEscape('\'.\''));
	test('Escapes argument when setting shell option, "."', testEscape('"."'));
	test('Escapes argument when setting shell option, (', testEscape('('));
	test('Escapes argument when setting shell option, )', testEscape(')'));
	test('Escapes argument when setting shell option, ]', testEscape(']'));
	test('Escapes argument when setting shell option, [', testEscape('['));
	test('Escapes argument when setting shell option, %', testEscape('%'));
	test('Escapes argument when setting shell option, !', testEscape('!'));
	test('Escapes argument when setting shell option, ^', testEscape('^'));
	test('Escapes argument when setting shell option, `', testEscape('`'));
	test('Escapes argument when setting shell option, <', testEscape('<'));
	test('Escapes argument when setting shell option, >', testEscape('>'));
	test('Escapes argument when setting shell option, &', testEscape('&'));
	test('Escapes argument when setting shell option, |', testEscape('|'));
	test('Escapes argument when setting shell option, ;', testEscape(';'));
	test('Escapes argument when setting shell option, ,', testEscape(','));
	test('Escapes argument when setting shell option, space', testEscape(' '));
	test('Escapes argument when setting shell option, *', testEscape('*'));
	test('Escapes argument when setting shell option, ?', testEscape('?'));
	test('Escapes argument when setting shell option, é', testEscape('é'));
	test('Escapes argument when setting shell option, empty', testEscape(''));
	test('Escapes argument when setting shell option, ()', testEscape('()'));
	test('Escapes argument when setting shell option, []', testEscape('[]'));
	test('Escapes argument when setting shell option, %1', testEscape('%1'));
	test('Escapes argument when setting shell option, %*', testEscape('%*'));
	test('Escapes argument when setting shell option, %!', testEscape('%!'));
	test('Escapes argument when setting shell option, %CD%', testEscape('%CD%'));
	test('Escapes argument when setting shell option, ^<', testEscape('^<'));
	test('Escapes argument when setting shell option, >&', testEscape('>&'));
	test('Escapes argument when setting shell option, |;', testEscape('|;'));
	test('Escapes argument when setting shell option, , space', testEscape(', '));
	test('Escapes argument when setting shell option, !=', testEscape('!='));
	test('Escapes argument when setting shell option, \\*', testEscape('\\*'));
	test('Escapes argument when setting shell option, ?.', testEscape('?.'));
	test('Escapes argument when setting shell option, =`', testEscape('=`'));
	test('Escapes argument when setting shell option, --help 0', testEscape('--help 0'));
	test('Escapes argument when setting shell option, "a b"', testEscape('"a b"'));
	test('Escapes argument when setting shell option, "foo|bar>baz"', testEscape('"foo|bar>baz"'));
	test('Escapes argument when setting shell option, "(foo|bar>baz|foz)"', testEscape('"(foo|bar>baz|foz)"'));

	// Unlike `spawnecho.cmd`, which forwards its arguments with `%*`, some batch files read them with `%1` or `%~1`, like Maven's `mvn.cmd`.
	// `read-arguments.cmd` prints its first argument, then its second one when the first one is `-f`. `ECHO` ends lines with CRLF.
	const testReadArguments = (commandArguments, expectedLines) => async () => {
		const {stdout} = await spawn('read-arguments', commandArguments, {cwd: FIXTURES_URL});
		assert.deepEqual(stdout.split('\r\n'), expectedLines);
	};

	test('Passes arguments to batch files reading them with %~1', testReadArguments(['-f', 'C:\\repo\\pom.xml'], ['first is -f', 'file is "C:\\repo\\pom.xml"']));
	test('Passes metacharacters to batch files reading them with %~1', testReadArguments(['-f', 'C:\\my repo\\a&b|c%PATH%.xml'], ['first is -f', 'file is "C:\\my repo\\a&b|c%PATH%.xml"']));
	// Only arguments that need quoting are quoted, so `%1` is the same as when typed in a terminal: `-f` stays unquoted, and `a b` includes its quotes
	test('Only quotes arguments that need it for batch files reading them with %1', testReadArguments(['a b'], ['first is "a b"']));

	// Like the launchers Gradle generates for Java programs, such as Android's `sdkmanager.bat`, `spawnlauncher.cmd` reads its first argument, then forwards them all with `%*`
	const testLauncher = input => async () => {
		const {stdout} = await spawn('spawnlauncher', [input], {cwd: FIXTURES_URL});
		assert.equal(stdout, input);
	};

	test('Passes argument to a batch file that reads and forwards it, plain', testLauncher('list'));
	test('Passes argument to a batch file that reads and forwards it, =', testLauncher('--sdk_root=C:\\sdk'));
	test('Passes argument to a batch file that reads and forwards it, space', testLauncher('a b'));
	test('Passes argument to a batch file that reads and forwards it, trailing \\', testLauncher('C:\\Program Files\\'));
	test('Passes argument to a batch file that reads and forwards it, &', testLauncher('a&b'));

	test('Cannot run shebangs', async () => {
		const error = await throwsAsync(spawn('./shebang.js', {cwd: FIXTURES_URL}));
		assertWindowsNonExistent(error, './shebang.js');
	});
} else {
	test('Can run shebangs', async () => {
		const {stdout} = await spawn('./shebang.js', {cwd: FIXTURES_URL});
		assert.equal(stdout, testString);
	});
}

test('Can run Bash', async () => {
	const {stdout} = await spawn(`echo ${testString}`, {cwd: FIXTURES_URL, shell: 'bash'});
	assert.equal(stdout, testString);
});

test('Does not double escape shell strings', async () => {
	const {stdout} = await spawn('node -p "0"', {shell: true});
	assert.equal(stdout, '0');
});
