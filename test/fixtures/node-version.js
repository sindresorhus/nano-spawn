#!/usr/bin/env node
import spawn from '../../source/index.js';

await spawn('node', ['--version'], {stdout: 'inherit'});
