# Reaper: a desktop companion

The reaper from the webspace, loose on your desktop. He floats around your screen, naps when you step away, and holds a ring of abilities, some useful and some just for show. He can also talk: ask him things and he answers in character, using Claude. While he's at it he can set reminders and timers, look at your screen, work with your clipboard, and remember things about you.

He lives in a transparent window that stays on top of everything. Clicks pass through to your apps everywhere except on the reaper himself and on his effects.

## Getting him

**[Download the latest release](https://github.com/dylan3737/y2k-site/releases/latest)** and pick the file for your computer:

| Computer | File |
|---|---|
| Mac with Apple silicon | `Reaper-…-mac-arm64.dmg` |
| Intel Mac | `Reaper-…-mac-x64.dmg` |
| Windows | `Reaper-…-win-x64.exe` |
| Linux | `Reaper-…-linux-x86_64.AppImage` |

The builds aren't code-signed, so the first launch needs one extra step:

- **macOS:** right-click the app and choose **Open**.
- **Windows:** choose **More info**, then **Run anyway**.
- **Linux:** mark the AppImage as executable first.

Or run it from source:

```bash
cd desktop
npm install
npm start
```

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
| Start the day | greets you with how many reminders are due today |
| Press **Ctrl+Alt+R** (**⌘⌥R** on a Mac) | vanishes and reappears at your cursor, even on another monitor |
| Press **Ctrl+Alt+Space** (**⌘⌥Space**) | appears at your cursor with Speak open |

The tray icon has the same commands, plus:

- **Wander:** on or off.
- **Talk on his own**
- **Sounds:** turn his sounds on or off.
- **Hide**
- **Open at login:** macOS and Windows only.
- **Forget what he remembers**
- **Forget API key**
- **Quit**

## Abilities

Soul is the meter under him. It refills in several ways:

- Slowly over time.
- Quickly while he rests.
- In a burst when you come back to the computer.
- When he catches ghosts or eats files.

When it's low, he fades.

| Ability | Soul | What it does |
|---|---|---|
| **Speak** | free | A chat card. Ask him anything. See [Speak](#speak). |
| **Slash** | 20 | His scythe cuts a picture of your screen in two; the halves slide apart over a void and close again. Nothing on your screen is changed. During Summon, it reaps every ghost. |
| **Summon** | 25 | Ten seconds of ghosts flying across your whole desktop. Click them to catch them. Golden ones are worth three. Your best catch is saved. |
| **Eclipse** | 10 | Darkens the screen except a circle of light around your cursor, for a minute. Cast again to end it. |
| **Hourglass** | 10 | A focus timer (5, 15, 25 or 50 minutes). Sand drains in a ring around him; hover over him to see the time left. When it runs out, a bell rings, you get a notification, and he offers a 5-minute break or another round. |
| **Raven** | 5 | A reminder. When it's due, a raven flies in with your note, and you get a notification. Snooze it or mark it done. Reminders are kept if you quit and reopen the app. |
| **Harvest** | free | Today's tally: time at the computer, timers finished, ghosts caught, files reaped. |
| **Hum** | 5 | A slow minor music-box tune over a drone. Cast again to stop it. |
| **Reap** | free | Reminds you that you can drop files on him. |
| **Haunt** | 5 | He follows your cursor for two minutes, keeping just off to the side. Click him to stop. |
| **Vanish** | free | He fades into the corner and stays quiet for 30 minutes. Click him to bring him back. |

## Speak

Speak runs on **Claude Haiku 5.5** (`claude-haiku-5-5`), Anthropic's fast, low-cost model, at low effort. Short chat replies cost a fraction of a cent. The calls are made from the app's main process.

### Your API key

To use Speak you need an Anthropic API key from [console.anthropic.com](https://console.anthropic.com/). The first time you open Speak, paste the key into the card.

- The key is encrypted with your system keychain (Keychain on macOS, DPAPI on Windows, the Secret Service on Linux) and kept in the app's settings file. It never reaches the page.
- If there's no keychain, which is common on Linux, the key isn't saved. Set `ANTHROPIC_API_KEY` in the environment before starting the app instead. A profile saved with `ant auth login` also works.
- **Forget API key** in the tray menu removes the saved key.

### What he can do for you

| Ask something like | He uses |
|---|---|
| "Remind me in 20 minutes to check the oven" | **Raven**: sends, lists or cancels reminders |
| "25-minute focus timer" | **Hourglass**: starts or stops the timer |
| "What's this error on my screen?" | **Look**: takes a picture of your screen, with him hidden, and looks at it |
| "Summarize what I copied" | **Clipboard**: reads the text you copied |
| "Copy that for me" | **Clipboard**: puts his text on your clipboard |
| "My name is Sam" / "Remember I like tea" | **Memory**: keeps short notes about you across conversations and restarts (up to 50) |
| "How did today go?" | **Harvest**: reads today's tally |
| "Do the ghost game" / "Follow me" | **Abilities**: casts Slash, Summon, Eclipse, Hum, Haunt or Vanish |

### Privacy

- **Look** and **reading the clipboard** ask your permission in the card every time, and send nothing unless you choose **Allow**. Unanswered requests are declined after 80 seconds.
- Screen pictures go to the model at no more than 1568 pixels on the long edge.
- He can't read or move files, browse the web, or click or type in other apps, and he says so if asked.

### Other details

- Replies stream into the card, and each finished reply has a **copy** button.
- **↺** starts a new conversation. Memory is kept until you forget it, either by asking him or with the tray menu.
- Haiku has no fallback model. If it declines a question, he says so, and that question is dropped from the conversation.

## Permissions

- **macOS:** Slash and Look need Screen Recording permission to photograph the screen (System Settings → Privacy & Security → Screen Recording). Without it, the scythe still swings but the screen isn't split, and Look reports that it can't see.
- **Linux:** transparency needs a compositing window manager, which most desktops have.

## Where things are kept

`companion.json` in the app's user-data folder keeps:

- Settings and soul.
- Your best catch.
- Pending reminders and a running timer.
- Today's tally.
- What he remembers.
- The encrypted key.

The folder is:

- macOS: `~/Library/Application Support/reaper-companion`
- Windows: `%APPDATA%\reaper-companion`
- Linux: `~/.config/reaper-companion`

## Releasing

The **Desktop release** workflow (`.github/workflows/desktop-release.yml`) builds the installers on macOS, Windows and Linux. To publish a release with them, push a tag that starts with `reaper-v`:

```bash
git tag reaper-v0.2.0
```

```bash
git push origin reaper-v0.2.0
```

Running the workflow by hand from the Actions tab only builds the installers, as downloadable artifacts, without making a release.

To build on your own machine instead, run the command for that machine (each writes to `desktop/dist/`):

```bash
npm run dist:mac
```

```bash
npm run dist:win
```

```bash
npm run dist:linux
```

## Files

| File | What it does |
|---|---|
| `main.js` | The window, tray, shortcuts, idle detection, screen capture, clipboard, the Trash, memory and saved state |
| `oracle.js` | Speak: the Claude conversation, its system prompt and tools |
| `preload.cjs` | The small API the page is allowed to use |
| `renderer/app.js` | Movement, dragging and throwing, resting, sleeping and haunting, the ring, greetings, and which parts of the window take clicks |
| `renderer/abilities.js` | Every ability, and the tool calls Speak makes |
| `renderer/speak.js` | The Speak card, its permission questions and copy buttons |
| `renderer/sound.js` | The bell, the slash, and Hum |
| `renderer/bridge.js` | The page's link to the app, with a stand-in so it also runs in a browser tab |

## Checks

From this folder:

```bash
npm test
```

This runs `tests/oracle.mjs`, which tests Speak's conversation loop against a fake API with no real calls. It then runs `tests/launch.mjs`, which starts the real app and checks the window, the bridge and the main process. On Linux without a display, run it under `xvfb-run -a npm test`.

From the repo root, `npm run test:desktop` checks the page itself in a headless browser.
