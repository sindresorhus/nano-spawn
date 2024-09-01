import process from 'node:process';

export const getResult = async (picoPromise, nodeChildProcess, context, options) => {
	try {
		const {picoSubprocess} = await picoPromise;
		const [result] = await Promise.all([picoSubprocess, handleInput(nodeChildProcess, options)]);
		return updateResult(result, context);
	} catch (error) {
		error.message = error.message.replaceAll(error.command, context.command);
		throw updateResult(error, context);
	}
};

const handleInput = async (nodeChildProcess, {input}) => {
	const {stdin} = await nodeChildProcess;
	if (input !== undefined) {
		stdin.end(input);
	}
};

const updateResult = (result, {command, start}) => Object.assign(result, {
	stdout: getOutput(result.stdout),
	stderr: getOutput(result.stderr),
	output: getOutput(result.output),
	command,
	durationMs: Number(process.hrtime.bigint() - start) / 1e6,
});

const getOutput = output => output.at(-1) === '\n'
	? output.slice(0, output.at(-2) === '\r' ? -2 : -1)
	: output;
