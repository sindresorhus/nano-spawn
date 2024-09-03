<h1 align="center" title="nano-spawn">
	<img src="media/logo.jpg" alt="nano-spawn logo">
</h1>

[![Install size](https://packagephobia.com/badge?p=nano-spawn)](https://packagephobia.com/result?p=nano-spawn)
![npm package minzipped size](https://img.shields.io/bundlejs/size/nano-spawn)
<!-- [![Downloads](https://img.shields.io/npm/dm/nano-spawn.svg)](https://npmjs.com/nano-spawn) -->
<!-- ![Dependents](https://img.shields.io/librariesio/dependents/npm/nano-spawn) -->

> Tiny process execution for humans — a better [`child_process`](https://nodejs.org/api/child_process.html)

> [!WARNING]
> This package is still a work in progress.

Check out [`execa`](https://github.com/sindresorhus/execa) for more features.

## Features

- Outputs combined result of stdout and stderr, similar to what you get in terminals
- Outputs lines
- No dependencies

## Install

```sh
npm install nano-spawn
```

---

*One of the maintainers [@ehmicky](https://github.com/ehmicky) is looking for a remote full-time position. Specialized in Node.js back-ends and CLIs, he led Netlify [Build](https://www.netlify.com/platform/core/build/), [Plugins](https://www.netlify.com/integrations/) and Configuration for 2.5 years. Feel free to contact him on [his website](https://www.mickael-hebert.com) or on [LinkedIn](https://www.linkedin.com/in/mickaelhebert/)!*

---

## Usage

```js
import $ from 'nano-spawn';

const result = await $('echo', ['🦄']);

console.log(result.exitCode);
//=> 0
```

**Advanced**

```js
import $ from 'nano-spawn';

for await (const line of $('ls', ['--oneline'])) {
	console.log(line);
}
//=> index.d.ts
//=> index.js
//=> …
```

## API

See the [types](source/index.d.ts) for now.

## Limitations

- It does not handle binary output. Use [`execa`](https://github.com/sindresorhus/execa) for that.

## Maintainers

- [Sindre Sorhus](https://github.com/sindresorhus)
- [@ehmicky](https://github.com/ehmicky)

## Related

- [execa](https://github.com/sindresorhus/execa) - Process execution for humans
- [unicorn-magic](https://github.com/sindresorhus/unicorn-magic/blob/6614e1e82a19f41d7cc8f04df7c90a4dfe781741/node.d.ts#L77-L125) - Slightly improved `child_process#execFile`
