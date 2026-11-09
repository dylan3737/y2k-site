// Entry point. Importing each module sets it up; the reaper starts last,
// once everything he talks to exists.
// No ?v= on these specifiers. A query string loads a second copy of the
// module, so initReaper() and Ferry's walkTo would not share one reaper.
// Cache-busting lives on the script tag in index.html.
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
