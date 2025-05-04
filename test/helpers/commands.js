import logProcessErrors from 'log-process-errors';
import {testString, secondTestString} from './arguments.js';

// Make tests fail if any warning (such as a deprecation warning) is emitted
logProcessErrors({
	exit: true,
	onError(error) {
		throw error;
	},
});

export const nodeHanging = ['node'];
export const [nodeHangingCommand] = nodeHanging;
export const nodePrint = bodyString => ['node', ['-p', bodyString]];
export const nodeEval = bodyString => ['node', ['-e', bodyString]];
export const nodeEvalCommandStart = 'node -e';
export const nodePrintStdout = nodeEval(`console.log("${testString}")`);
export const nodePrintStderr = nodeEval(`console.error("${testString}")`);
export const nodePrintBoth = nodeEval(`console.log("${testString}");
setTimeout(() => {
	console.error("${secondTestString}");
}, 0);`);
export const nodePrintBothFail = nodeEval(`console.log("${testString}");
setTimeout(() => {
       console.error("${secondTestString}");
       process.exit(2);
}, 0);`);
export const nodePrintFail = nodeEval(`console.log("${testString}");
process.exit(2);`);
export const nodePrintSleep = nodeEval(`setTimeout(() => {
	console.log("${testString}");
}, 1e2);`);
export const nodePrintSleepFail = nodeEval(`setTimeout(() => {
	console.log("${testString}");
	process.exit(2);
}, 1e2);`);
export const nodePrintArgv0 = nodePrint('process.argv0');
export const nodePrintNoNewline = output => nodeEval(`process.stdout.write("${output.replaceAll('\n', '\\n').replaceAll('\r', '\\r')}")`);
export const nodePassThrough = nodeEval('process.stdin.pipe(process.stdout)');
export const nodePassThroughPrint = nodeEval(`process.stdin.pipe(process.stdout);
console.log("${testString}");`);
export const nodePassThroughPrintFail = nodeEval(`process.stdin.once("data", (chunk) => {
	console.log(chunk.toString());
	process.exit(2);
});
console.log("${testString}");`);
export const nodeToUpperCase = nodeEval(`process.stdin.on("data", chunk => {
	console.log(chunk.toString().trim().toUpperCase());
});`);
export const nodeToUpperCaseStderr = nodeEval(`process.stdin.on("data", chunk => {
	console.error(chunk.toString().trim().toUpperCase());
});`);
export const nodeToUpperCaseFail = nodeEval(`process.stdin.on("data", chunk => {
	console.log(chunk.toString().trim().toUpperCase());
	process.exit(2);
});`);
export const nodeDouble = nodeEval(`process.stdin.on("data", chunk => {
	console.log(chunk.toString().trim() + chunk.toString().trim());
});`);
export const nodeDoubleFail = nodeEval(`process.stdin.on("data", chunk => {
	console.log(chunk.toString().trim() + chunk.toString().trim());
	process.exit(2);
});`);
export const localBinary = ['ava', ['--version']];
export const localBinaryCommand = localBinary.flat().join(' ');
export const [localBinaryCommandStart] = localBinary;
export const nonExistentCommand = 'non-existent-command';
