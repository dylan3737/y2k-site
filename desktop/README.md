# Reaper: a desktop companion

The reaper from the webspace, loose on your desktop. He floats around your screen, naps when you step away, and holds a few abilities, some useful and some just for show. He can also talk: ask him things and he answers in character, using Claude, and he can set reminders and timers for you while he's at it.

He lives in a transparent window that stays on top of everything. Clicks pass through to your apps everywhere except on the reaper himself and on his effects.

## Running it

```bash
cd desktop
npm install
npm start
```

## Building an installer

```bash
npm run dist:mac
```

```bash
npm run dist:win
```

```bash
npm run dist:linux
```

Each one writes to `desktop/dist/`: a `.dmg` on macOS, an NSIS installer on Windows and an AppImage on Linux. Build each on its own platform. The builds aren't code-signed, so macOS Gatekeeper and Windows SmartScreen will warn the first time you open one.

## Handling him

| Do this | And he… |
|---|---|
| Click him | opens his ring of abilities |
| Right-click him | shows the tray menu |
| Drag him and let go gently | kneels and rests; soul refills fast |
| Fling him | flies off, bouncing off the screen edges |
| Drop files on him | eats them: they go to the Trash or Recycle Bin, so you can still get them back |
| Rub the cursor back and forth over him | reacts (grudgingly) |
| Leave the computer for 3 minutes | falls asleep, and tells you how long you were gone when you're back |
| Press **Ctrl+Alt+R** (**⌘⌥R** on a Mac) | vanishes and reappears at your cursor, even on another monitor |
| Press **Ctrl+Alt+Space** (**⌘⌥Space**) | appears at your cursor with Speak open |

The tray icon has the same commands, plus **Wander** (on or off), **Talk on his own**, **Hide**, **Open at login** (macOS and Windows), **Forget API key** and **Quit**.

## Abilities

Soul is the meter under him. It refills slowly over time, quickly while he rests, and in a burst when you come back to the computer. Catching ghosts and feeding him files refill it too.

| Ability | Soul | What it does |
|---|---|---|
| **Speak** | free | A chat card. Ask him anything. He can use Raven, Hourglass and the visual abilities for you. |
| **Slash** | 20 | His scythe cuts a picture of your screen in two; the halves slide apart over a void and close again. Nothing on your screen is changed. During Summon, it reaps every ghost. |
| **Summon** | 25 | Ten seconds of ghosts flying across your whole desktop. Click them to catch them. Golden ones are worth three. Your best catch is saved. |
| **Eclipse** | 10 | Darkens the screen except a circle of light around your cursor, for a minute. Cast again to end it. |
| **Hourglass** | 10 | A focus timer (5, 15, 25 or 50 minutes). Sand drains in a ring around him; hover over him to see the time left. When it runs out, a bell rings and you get a notification. |
| **Raven** | 5 | A reminder. When it's due, a raven flies in with your note, and you get a notification. Snooze it or mark it done. Reminders are kept if you quit and reopen the app. |
| **Harvest** | free | Today's tally: time at the computer, timers finished, ghosts caught, files reaped. |
| **Hum** | 5 | A slow minor music-box tune over a drone. Cast again to stop it. |
| **Reap** | free | Reminds you that you can drop files on him. |
| **Vanish** | free | He fades into the corner and stays quiet for 30 minutes. Click him to bring him back. |

## Speak

Speak runs on Claude (`claude-opus-5-5`) through the Anthropic SDK, and the calls are made from the app's main process. To use it you need an Anthropic API key from [console.anthropic.com](https://console.anthropic.com/). The first time you open Speak, paste the key into the card.

- The key is encrypted with your system keychain (Keychain on macOS, DPAPI on Windows, the Secret Service on Linux) and kept in the app's settings file. It never reaches the page.
- If there's no keychain, which is common on Linux, the key isn't saved. Set `ANTHROPIC_API_KEY` in the environment before starting the app instead. A profile saved with `ant auth login` also works.
- **Forget API key** in the tray menu removes the saved key.

He can use these tools while talking:

- Set or stop the Hourglass.
- Send, list or cancel ravens (reminders).
- Cast Slash, Summon, Eclipse, Hum or Vanish.
- Read today's tally.

He can't see your screen, read your files, browse the web or control other apps, and he says so if asked.

Some details of how it works:

- Replies stream into the card.
- A request turned down for policy reasons is retried on Anthropic's default fallback model (server-side fallbacks). If the fallback declines too, he says he won't touch it and the conversation starts over.
- **↺** starts a new conversation.
- Each message costs API usage on your key. The model runs at low effort, which keeps chat replies quick and cheap.

## Permissions

- **macOS:** Slash needs Screen Recording permission to photograph the screen (System Settings → Privacy & Security → Screen Recording). Without it, the scythe still swings but the screen isn't split.
- **Linux:** transparency needs a compositing window manager, which most desktops have.

## Where things are kept

Settings, soul, your best catch, pending reminders, a running timer and today's tally are all kept in `companion.json` in the app's user-data folder:

- macOS: `~/Library/Application Support/reaper-companion`
- Windows: `%APPDATA%\reaper-companion`
- Linux: `~/.config/reaper-companion`

## Files

| File | What it does |
|---|---|
| `main.js` | The window, tray, shortcuts, idle detection, screen capture, the Trash, and saved state |
| `oracle.js` | Speak: the Claude conversation, its system prompt and tools |
| `preload.cjs` | The small API the page is allowed to use |
| `renderer/app.js` | Movement, dragging and throwing, resting and sleeping, the ring, and which parts of the window take clicks |
| `renderer/abilities.js` | Every ability, and the tool calls Speak makes |
| `renderer/speak.js` | The Speak card |
| `renderer/sound.js` | The bell, the slash, and Hum |
| `renderer/bridge.js` | The page's link to the app, with a stand-in so it also runs in a browser tab |

## Checks

From this folder:

```bash
npm test
```

This runs `tests/oracle.mjs`, which tests Speak's conversation loop against a fake API with no real calls. It then runs `tests/launch.mjs`, which starts the real app and checks the window, the bridge and the main process. On Linux without a display, run it under `xvfb-run -a npm test`.

From the repo root, `npm run test:desktop` checks the page itself in a headless browser.
