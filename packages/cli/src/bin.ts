#!/usr/bin/env node
import { main } from "./cli.js";

main(process.argv.slice(2), {
  stdout: process.stdout,
  stderr: process.stderr,
  stdin: process.stdin,
  env: process.env,
}).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    process.stderr.write(`guidon: unexpected error: ${(error as Error)?.stack ?? String(error)}\n`);
    process.exitCode = 1;
  }
);
