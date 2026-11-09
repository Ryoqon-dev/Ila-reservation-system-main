// Compatibility entry point for the complete representative-account update.
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {applyUpdate,runUpdateCLI} from './apply-account-update.mjs';
export {applyUpdate};
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))runUpdateCLI().catch(error=>{console.error(error.message);process.exitCode=1});
