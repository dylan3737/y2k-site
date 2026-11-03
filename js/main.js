// Entry point. Importing each module sets it up; the reaper starts last,
// once everything he talks to exists.
import './theme.js';
import './fluid.js';
import './audio.js';
import './games.js';
import './ui.js';
import './actions.js';
import './rites.js';
import './spells.js';
import './spellbook.js';
import { initReaper } from './reaper.js';

initReaper();
