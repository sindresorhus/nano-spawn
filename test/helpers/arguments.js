export const testString = 'test';
export const secondTestString = 'secondTest';
export const thirdTestString = 'thirdTest';
export const fourthTestString = 'fourthTest';
export const testUpperCase = testString.toUpperCase();
export const testDouble = `${testString}${testString}`;
export const testDoubleUpperCase = `${testUpperCase}${testUpperCase}`;

export const multibyteString = '.\u{1F984}.';
const multibyteUint8Array = new TextEncoder().encode(multibyteString);
export const multibyteFirstHalf = multibyteUint8Array.slice(0, 3);
export const multibyteSecondHalf = multibyteUint8Array.slice(3);

// Arguments with characters that `cmd.exe` interprets, for the files it runs on Windows.
// The backslashes at the end of an argument, and those preceding a double quote, are doubled when escaping, so long runs of them are included too.
const backslash = '\\';
export const cmdArguments = [
	'"',
	'\\',
	'\\.',
	'\\"',
	'\\\\"',
	'a b',
	'\'.\'',
	'"."',
	'(',
	')',
	']',
	'[',
	'%',
	'!',
	'^',
	'`',
	'<',
	'>',
	'&',
	'|',
	';',
	',',
	' ',
	'*',
	'?',
	'é',
	'',
	'()',
	'[]',
	'%1',
	'%*',
	'%!',
	'%CD%',
	'^<',
	'>&',
	'|;',
	', ',
	'!=',
	'\\*',
	'?.',
	'=`',
	'--help 0',
	'"a b"',
	'"foo|bar>baz"',
	'"(foo|bar>baz|foz)"',
	`a${backslash}`,
	`a${backslash.repeat(2)}`,
	`a${backslash.repeat(8)}`,
	`a${backslash}"`,
	`a${backslash.repeat(2)}"`,
	`${backslash.repeat(64)}x`,
	backslash.repeat(512),
];

// A short and unambiguous name for a test of each argument
export const getArgumentName = argument => argument.length > 20 ? `${JSON.stringify(argument.slice(0, 10))}… (${argument.length} characters)` : JSON.stringify(argument);
