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
