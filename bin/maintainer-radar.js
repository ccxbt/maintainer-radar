#!/usr/bin/env node

import { runCli } from "../src/main.js";

runCli(process.argv.slice(2)).catch((error) => {
  console.error(`maintainer-radar failed: ${error.message}`);
  process.exit(1);
});
