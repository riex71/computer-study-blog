import {startWriter} from './writer.mjs';
import {createPrivateAdapter} from './private-editor.mjs';
await startWriter(createPrivateAdapter());
