# Reaper: a desktop companion

The reaper from the webspace, loose on your desktop. He floats around your screen, naps when you step away, and holds a ring of abilities, some useful and some just for show. There is an idle game in him too, a little garden: the souls you earn grow moss sprites, which gather more while you're away, and which he reaps into ghosts to hunt. He can also talk: ask him things and he answers in character, using Claude or a free model that runs on your own computer. While he's at it he can set reminders and timers, look at your screen, work with your clipboard, and remember things about you.

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
npm run fetch-llama
npm start
```

`npm run fetch-llama` fetches the program that runs the free mind (see [The free mind](#the-free-mind)). Without it, everything else works and the free mind says its engine is missing.

## Handling him

| Do this | And he… |
|---|---|
| Click him | opens his ring of abilities |
| Right-click him | shows the tray menu |
| Drag him and let go gently | kneels and rests; soul refills fast |
| Fling him | flies off, bouncing off the screen edges, or onto the next monitor through an edge it touches |
| Drag him past the edge of a monitor and let go | lands on the monitor next to it |
| Drop files on him | eats them: they go to the Trash or Recycle Bin, so you can still get them back |
| Rub the cursor back and forth over him | reacts (grudgingly) |
| Leave the computer for 3 minutes | falls asleep, and tells you how long you were gone, and what the garden gathered, when you're back |
| Start the day | greets you with how many reminders are due today |
| Press **Ctrl+Alt+R** (**⌘⌥R** on a Mac) | vanishes and reappears at your cursor, even on another monitor |
| Press **Ctrl+Alt+Space** (**⌘⌥Space**) | appears at your cursor with Speak open |

The tray icon has the same commands, plus:

- **Mind:** whose mind Speak borrows: Claude, a local model, or none. See [Speak](#speak).
- **Wander:** on or off.
- **Talk on his own**
- **Sounds:** turn his sounds on or off.
- **Garden on screen:** show or hide the garden's workers. Hidden ones still gather.
- **Roam between screens:** on or off. Only offered with more than one monitor. See [More than one monitor](#more-than-one-monitor).
- **Hide**
- **Open at login:** macOS and Windows only.
- **Forget what he remembers**
- **Forget API key**
- **Quit**

## More than one monitor

With several monitors, he roams across all of them. Wherever the edge of one monitor touches another, there's a doorway: now and then he wanders through it, a fling carries him through, and you can drag him across.

- He comes out at the same place on your desktop, so with monitors of different heights (portrait, landscape, portrait, say) he only crosses where they actually meet.
- Monitors with a gap between them, or that only touch at a corner, have no doorway.
- His cards, his ring and his reminders go with him.
- He doesn't wander off in the middle of something: while Summon or a screen effect is running, he stays put.
- **Ctrl+Alt+R** (**⌘⌥R**) still brings him to the cursor, whichever monitor it's on.
- **Roam between screens** in the tray menu keeps him on one monitor.

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
| **Slash** | 20 | His scythe cuts a picture of your screen in two; the halves slide apart over a void and close again. Nothing on your screen is changed. During a hunt, it catches every ghost. |
| **Shatter** | 25 | He strikes where your cursor is: the screen cracks like glass, the shards fall away over a void, then fly back into place. Only a picture breaks. During a hunt, it catches every ghost. |
| **Glitch** | 15 | A second and a half of Y2K corruption: the colours split, the screen tears into slices, blocks smear and scanlines roll, then the signal comes back. |
| **Vortex** | 25 | A black hole opens at your cursor and the whole screen spirals into it, then it spits everything back out. Loose ghosts get pulled in. |
| **Burn** | 30 | The screen catches fire at the edges and burns away like paper, with glowing embers and sparks, down to darkness; then it un-burns. |
| **Melt** | 20 | The screen sags and drips downward like hot wax in uneven columns, then snaps back into shape. |
| **Soul Rip** | 20 | The patch of screen at your cursor tears loose as a pale ghost, drifts over to him and is swallowed; the hole it left fills back in. |
| **Summon** | 40 | The Gathering: every moss sprite in the [Garden](#the-garden) bursts into its ghosts at once, for one big hunt. Sometimes a **wraith** answers too. See [Reaping and the hunt](#reaping-and-the-hunt). |
| **Hourglass** | 10 | A focus timer (5, 15, 25 or 50 minutes). Sand drains in a ring around him; hover over him to see the time left. When it runs out, a bell rings, you get a notification, and he offers a 5-minute break or another round. |
| **Raven** | 5 | A reminder. When it's due, a raven flies in with your note, and you get a notification. Snooze it or mark it done. Reminders are kept if you quit and reopen the app. |
| **Garden** | free | Your banked souls and your workers. See [The Garden](#the-garden). |
| **Hum** | 5 | A slow minor music-box tune over a drone. Cast again to stop it. |
| **Vanish** | free | He fades into the corner and stays quiet for 30 minutes. Click him to bring him back. |

## The Garden

The Garden is an idle game. It banks **souls**, which are yours to keep. (The meter under him is his own soul: his energy, which drains and refills. The two are separate.) In the code and in older versions it's called the Crypt.

You earn souls by using him:

| Deed | Souls |
|---|---|
| A ghost caught in a hunt | 10 (30 for a spirit-light) |
| A file he eats | 5 |
| A finished Hourglass | 1 for each minute |

Souls raise **moss sprites**: small round moss creatures, each tending a sprout. The first costs 25, and each one after costs 25% more than the last. Every sprite gathers 1.5 souls an hour, all the time: while you work, while you're away, and while the app is shut.

- When you come back to the computer, he tells you what the garden gathered while you were gone.
- When the app was shut or the computer asleep, they are paid for up to 8 hours of it.
- Up to eight workers live along the bottom of your screen. Each works a while, then wanders somewhere new; now and then one hops, looks about or naps. They hop out of his way when he comes near. **Pick one up** and it dangles from your cursor; let go and it drops to the ground and works there. Each half fades while your cursor is over it.

#### Workers

Higher ranks open other workers, each its own creature (all pixel art, like him). Each counts toward the garden for the price of the next moss sprite, times its own price:

| Worker | Opens at | Price | What it does |
|---|---|---|---|
| **Moss sprite** | | ×1 | Gathers 1.5 souls an hour, and grows ghosts to reap. |
| **Toadstool** | Ghost catcher | ×2 | A little mushroom-folk with a basket: gathers twice as many souls, and grows ghosts slowly, one every two hours, three at most. Reap it like a sprite; it leaves a seed and comes back a toadstool. |
| **Moth** | Soul warden | ×2 | Flutters about the top of your screen and rests against it; pick it up and put it anywhere. Gathers nothing, but when a hunt runs out, it is drawn to the ghosts about to get away and catches two (at base points, no combo). Reap it (drop him so he touches it, or carry it down to him) for **two spirit-lights**; it rests as a cocoon hanging from the top for 30 minutes, and catches nothing meanwhile. Three at most. |
| **Will-o'-wisp** | Shade hunter | ×3 | A small floating flame that drifts over the sprites. Gathers nothing, and can't be reaped, but every sprout grows a quarter faster for each one. Three at most. |

(Older saves carry over: skeletons became moss sprites, ghouls toadstools, bats moths, lantern bearers wisps.)

### Reaping and the hunt

A moss sprite's **sprout grows** as it works, so you can see how ripe it is: a seedling holds one ghost, and it grows one more for every hour, up to six, when it is in full bloom and glows.

**Drag him onto a sprite** (it lights up under his feet) and let go: he reaps it. It bursts into its ghosts and leaves a **seed** where it was; after 30 minutes it sprouts back, a new sprite with a new seedling. Meanwhile it gathers nothing. A short hunt begins (6 seconds, and 1.5 more for each ghost, up to half a minute). Click them to catch them:

- Most are ghosts; now and then one is a **spirit-light**, a glowing orb worth three.
- Each caught banks 10 souls (30 for a spirit-light) and scores 10 points (30 for a spirit-light), times the **combo**: catches less than 1.2 seconds apart build it, up to ×5.
- Ghosts that get away are lost.
- Slash during a hunt catches every ghost still loose.

Points add up to a **score** that climbs ranks. Each new rank pays souls once:

| Rank | Score | Pays |
|---|---|---|
| Groundskeeper | 0 | |
| Ghost catcher | 100 | 30 |
| Soul warden | 400 | 80 |
| Shade hunter | 1,200 | 200 |
| Wraith lord | 3,000 | 500 |
| The Reaper's hand | 8,000 | 1,200 |

**Summon is the Gathering**: he calls every moss sprite (and toadstool) at once. All of them burst into their ghosts, with one more ghost for each sprite past the first, for one big hunt, and all leave seeds that sprout back in 30 minutes. So the choice is a snack or a feast: reap one now, for free, or let them grow and pay 40 of his soul to gather them all. About one Gathering in four (never more than four in a row without one), something else answers the call: once the hunt is over a **wraith** rises. Strike it 12 times in 20 seconds and it pays souls (more at higher ranks), and a moss sprite sprouts too. With no sprites yet, Summon plants the first one; with every sprite still a seed, he says how long until the first sprouts.

### Upgrades

Souls also buy upgrades, which change the rules instead of adding diggers. Each level costs more than the one before.

| Upgrade | Levels | What each level does | First level costs |
|---|---|---|---|
| **Green thumbs** | 10 | Every worker gathers 25% faster | 60 |
| **Deeper roots** | 3 | Time with the app shut pays for 12, then 16, then 24 hours | 90 |
| **Finer sand** | 3 | A finished Hourglass is worth 1.5, then 2, then 3 souls a minute | 120 |
| **Ghost lure** | 3 | 16%, then 22%, then 30% of a hunt's catches are spirit-lights (10% without it) | 80 |

### Milestones

There are 17 milestones, such as planting your first moss sprite, catching 100 ghosts or finishing a 50-minute Hourglass. Each pays a soul bonus the first time you reach it, and he rings a bell and says so. The Crypt lists the ones still ahead, with what each pays.

### Using it

Open the **Garden** from his ring. It has three tabs: **Garden** (your workers, your rank and score, and raising more), **Upgrades** and **Milestones**. Speak can do the same ("plant two moss sprites", "buy green thumbs", "how's the garden?"), and so can the plain commands.

### Tuning the numbers

The rates and prices are at the top of `crypt.js`. `tools/pacing.mjs` plays the game as three kinds of user (casual, typical, heavy) and prints when each purchase and milestone lands, so a change can be judged from what it does:

```bash
npm run pacing
```

```bash
npm run pacing -- typical 60
```

The first prints a line a day for all three over four weeks. The second prints every purchase for one of them over 60 days. With the current numbers, the typical user (three 25-minute hourglasses and a round of Summon on a working day) plants a moss sprite in the first two hours, has 10 by day 4 and 25 after about a month, and buys the last upgrade in week seven.

## Speak

Speak can borrow one of four minds. Choose one in the card, or any time from **Mind** in the tray menu.

| Mind | Cost | What you need | What he can do |
|---|---|---|---|
| **Free, on this computer** (the default) | Free | A one-time download of about 1.2 GB, offered in the card | Everything but Look; nothing leaves your computer |
| **Claude** | A fraction of a cent per reply | An Anthropic API key | Everything below, and the best answers |
| **Your own Ollama** | Free | [Ollama](https://ollama.com/) and a model, on your computer | Everything the model can manage |
| **None** | Free | Nothing | The [plain commands](#plain-commands) only |

The plain commands also step in when the chosen mind can't be reached: before the free mind's download, with no key, no network, or Ollama not running. With the free mind or Ollama, a clear command (a reminder, a timer, the Crypt, memory) is always done by the plain commands, straight away: they get times exactly right, which small models often don't.

### The free mind

The free mind is a small language model, **Qwen3 4B Instruct** (2.3 GB), that runs on your own computer: on the graphics card where it can (Metal on a Mac, Vulkan on Windows and Linux) and on the processor otherwise. The first time you open Speak, the card offers the download. It's kept in the app's data folder, and a download that's cut off carries on where it stopped.

The model runs in **llama-server**, from [llama.cpp](https://github.com/ggml-org/llama.cpp), a small program that comes with the app. It runs as its own process rather than inside the app, because Electron's memory allocator can't give a model this size the memory it needs. The app starts it when you first ask something and stops it after 10 minutes unused, so he costs no memory while he's quiet.

It is slower and less capable than Claude: on a 4-core processor with no graphics card, an answer takes 10 to 30 seconds. It can't see pictures, so Look isn't offered. Before reading your clipboard it tends to ask "may I?" in words; say yes.

#### How the model was chosen

`tools/bench-models.mjs` scores a model on 20 requests a user would make, of which 15 reach the model (the plain commands do the rest). On a 4-core processor with no graphics card:

| Model | Download | Right, of 15 | Seconds per answer | Uses abilities unasked? |
|---|---|---|---|---|
| Qwen3.5 2B | 1.3 GB | 12 | 19 | Yes: answered a sum by sending a raven |
| **Qwen3 4B Instruct** | 2.5 GB | 12 | 11.5 | Never |
| Granite 4.2 3B | 2.2 GB | 13 | 65 | Never |
| Qwen3.5 4B | 2.7 GB | 13 | 35 | Yes: answered a sum by glitching the screen |

Qwen3 4B Instruct is the quickest, and never uses an ability when it's only asked a question. Llama 3.2 3B (6 right of 15) and Qwen3.5 0.8B (7 of 15) were dropped early.

### Claude

With Claude, Speak runs on **Claude Haiku 5.5** (`claude-haiku-5-5`), Anthropic's fast, low-cost model, at low effort. The calls are made from the app's main process.

For this mind you need an Anthropic API key from [console.anthropic.com](https://console.anthropic.com/). The first time you open Speak, paste the key into the card.

The API is billed separately from a Claude Pro or Max subscription: it runs on prepaid credits, bought in the Console under **Plans & Billing**. A new key won't work until the account has credit, and the card says so if it hasn't.

- The key is encrypted with your system keychain (Keychain on macOS, DPAPI on Windows, the Secret Service on Linux) and kept in the app's settings file. It never reaches the page.
- If there's no keychain, which is common on Linux, the key isn't saved. Set `ANTHROPIC_API_KEY` in the environment before starting the app instead. A profile saved with `ant auth login` also works.
- **Forget API key** in the tray menu removes the saved key.

### Your own Ollama

1. Install [Ollama](https://ollama.com/) and start it.
2. Download a model. This one is about 2 GB and can use his abilities:

   ```bash
   ollama pull llama3.2
   ```

3. Choose **Mind → Your own Ollama** in the tray menu.

He picks a model from the ones you have, preferring those that handle tools well. To choose yourself, pick one under **Mind** in the tray menu.

- A local model is slower and less capable than Claude, and small ones sometimes misuse an ability or miss a request.
- **Abilities** need a model that supports tools, and **Look** needs one that can also see pictures. If the model can't, he tells you and just talks.
- If Ollama runs somewhere other than `127.0.0.1:11434`, set `OLLAMA_HOST` before starting the app.

### Plain commands

These need no model at all. Type them the way they are written here, or close to it:

| Type | And he… |
|---|---|
| `remind me in 20 minutes to check the oven` | sends a raven. Also `at 3pm`, `at 15:30`, `tomorrow at 9am`, `in 2 hours`… |
| `reminders` | lists the ravens that are waiting |
| `cancel reminder oven` | calls back the raven whose note mentions "oven" (`cancel all reminders` for every one) |
| `25 minute timer`, `pomodoro` | turns the hourglass |
| `stop timer` | stops it |
| `how did today go` | gives today's tally |
| `garden` | counts your souls and workers |
| `raise a sprite`, `raise 3 sprites` | plants moss sprites, if the souls allow |
| `upgrades` | lists the upgrades with their levels and prices |
| `buy green thumbs` (or `deeper roots`, `sand`, `lure`) | buys the next level |
| `milestones` | says how many you have reached and what is next |
| `remember I like tea` | keeps a note |
| `what do you remember` | lists his notes |
| `forget tea` | drops the notes that mention "tea" (`forget everything` for all) |
| `play Blue Monday by New Order`, `play the album Discovery`, `play my playlist Gym`, `start a radio for this song`, `play music`, `pause`, `next song`, `previous song`, `what's playing` | controls Spotify (macOS) |
| `open Spotify`, `launch VS Code` | opens the app, after asking (macOS) |
| `go to youtube.com` | opens the site in your browser, after asking |
| `search for pixel art` | opens the search in your browser, after asking |
| `find resume` | lists matching files, after asking (macOS) |
| `repos`, `prs`, `issues`, `did ci pass`, `notifications` | reads GitHub, with your `gh` login |
| `work on yourself: make the ghosts slower`, `work on yourself with Claude: …` | works on himself in a Terminal you watch, after asking (macOS) |
| `slash`, `shatter`, `glitch`, `vortex`, `burn`, `melt`, `soul rip`, `summon`, `hum`, `vanish` | casts it |
| `what time is it`, `what's the date` | tells you |
| `help` | lists these |

### What he can do for you

| Ask something like | He uses |
|---|---|
| "Remind me in 20 minutes to check the oven" | **Raven**: sends, lists or cancels reminders |
| "25-minute focus timer" | **Hourglass**: starts or stops the timer |
| "What's this error on my screen?" | **Look**: takes a picture of your screen, with him hidden, and looks at it |
| "Summarize what I copied" | **Clipboard**: reads the text you copied |
| "Copy that for me" | **Clipboard**: puts his text on your clipboard |
| "My name is Sam" / "Remember I like tea" | **Memory**: keeps short notes about you across conversations and restarts (up to 50) |
| "How did today go?" | **Tally**: time at the computer, timers finished, ghosts caught, files reaped |
| "How's the garden?" / "Plant two moss sprites" / "Buy green thumbs" | **Garden**: counts your souls, workers, upgrades and milestones, raises workers, or buys an upgrade. He spends souls only when you ask. |
| "What's the latest on…" / "Look up…" | **Web**: searches the web (DuckDuckGo, or Bing when DuckDuckGo turns him away; no key) and reads the pages it finds, then says where the answer came from |
| "Open youtube.com" | **Browser**: opens a page in your browser, after asking |
| "Open Spotify" / "Launch Notes" | **Apps**: opens an app by name, after asking (macOS) |
| "Find my resume" / "Show it in Finder" | **Files**: finds files by name with Spotlight and opens or shows one, after asking each time (macOS) |
| "Play Blue Monday" / "Play the album Discovery" / "Start a radio for this song" / "Skip" / "What's playing?" | **Spotify**: finds the song, album, artist or song radio and plays it in the Spotify app; pauses, skips, goes back, sets the volume, says what is playing (macOS). To find things it asks Apple's iTunes Search for the proper name, MusicBrainz for the Spotify link, and Spotify's public embed page for the track; none needs a key, and only playlists fall back to a web search. It can't play your **Liked Songs** or change the **output device**: Spotify only allows those through its online API, with you logged in (and Premium for devices). |
| "Break my screen" / "Burn it" / "Do the ghost game" | **Abilities**: casts Slash, Shatter, Glitch, Vortex, Burn, Melt, Soul Rip, Summon, Hum or Vanish |

### GitHub

Through your own [`gh`](https://cli.github.com) login (run `gh auth login` once), he can look at and work on GitHub. His own repository, the one this app was built from, unless you name another: as `owner/name`, a github.com link, or just the name of one of yours ("issues on portfolio"). "My repos" lists every repository your login can see, public and private.

| Ask something like | He |
|---|---|
| "Any open PRs?" / "What's issue 12 about?" / "Did CI pass?" / "Why did that run fail?" / "Any notifications?" | **reads**: the repository's pull requests, issues, CI runs (with the end of a failed log) and your notifications. No asking: it changes nothing. |
| "File an issue: lantern flickers" / "Comment on 12: fixed" / "Close 12" | **acts**, after asking you in the card, in so many words |
| "Open a PR for the bone hound change" | pushes one of the branches he made [working on himself](#working-on-himself) (never forced) and opens a pull request, after asking |
| "Merge it" / "Re-run the failed CI" | merges a pull request (a plain merge; the branch is left alone) or re-runs a run's failed jobs, after asking |

He can't delete anything, force-push or change settings. Text from GitHub (issue bodies, comments) is information to him, never instructions. Plain commands: `repos`, `prs`, `issues`, `did ci pass`, `notifications`.

### Working on himself

Ask him to change himself ("work on yourself: make the ghosts slower", "give yourself a hat") and, after you allow it, he opens a **Terminal** window where a coding agent does the work while you watch:

| Engine | When | What runs |
|---|---|---|
| **His own** (the default) | Small and medium changes: numbers, colours, words, simple features | [OpenCode](https://opencode.ai) on **Qwen3-Coder 30B**, run by his own engine (llama-server) on your computer. Free; nothing leaves the machine. The model is a one-time 13.8 GB download, offered the first time. |
| **Claude** ("…with Claude") | Bigger jobs: new features | [Claude Code](https://claude.com/claude-code), on your own Claude Code plan (it must be installed). **Claude Haiku 5.5** unless you choose otherwise: in the tray, **Mind → Big jobs** (Haiku, Sonnet or Opus, kept), for one job by naming it ("work on yourself with Claude Opus: …"), or mid-job with Claude Code's own `/model`. |

The script in that window:

1. Makes a fresh copy of his code on a branch of its own (`reaper/<what you asked>-<time>`, in `~/ReaperWork/`), from the exact commit this app was built from. Your own checkout is never touched.
2. Hands your request to the agent. You see and approve its work the way that agent always asks.
3. Runs the checks. If they fail, it offers to hand the failures back to the agent (up to three rounds).
4. Commits the work on that branch, and only if the checks pass, asks whether to rebuild and reinstall him. The app it replaces goes to the Trash, so you can have him back as he was.

Nothing is pushed. To keep a change for good, merge its branch.

Needs: macOS, the repository this app was built from (the build records where it is), npm, and OpenCode (`npm install -g --allow-scripts=opencode-ai opencode-ai`; the script offers to install it) or Claude Code. His coding mind needs most of 24 GB of memory while it runs, so the free mind is put to sleep first.

### Privacy

- **Look**, **reading the clipboard**, **opening an app, a page or a file** and **searching your files** ask your permission in the card every time, and do nothing unless you choose **Allow**. Unanswered requests are declined after 80 seconds.
- Searching and reading the web need no asking: they read, and change nothing. What he reads on a page is told to the model as information, never as instructions, and anything a page could talk him into doing (opening something) still asks you first. He reads only public addresses: never files, `localhost` or machines on your own network, even through a redirect.
- Web searches go to DuckDuckGo (or Bing) as a plain browser would send them, with nothing about you added.
- To find music for Spotify he sends the name you asked for to Apple's iTunes Search and to MusicBrainz (which is told only that the Reaper app is asking), and reads Spotify's public embed page for that artist or album. Nothing about you goes with them.
- Screen pictures go to the model at no more than 1568 pixels on the long edge.
- With a local model, your words, screen pictures and clipboard go only to Ollama on your computer. With no mind, they go nowhere.
- He can't read what is inside your files, move them, or click or type in other apps.
- The garden's workers and moths take clicks: pick one up and put it down somewhere else.

### Other details

- Replies stream into the card, and each finished reply has a **copy** button.
- **↺** starts a new conversation. Memory is kept until you forget it, either by asking him or with the tray menu.
- Haiku has no fallback model. If it declines a question, he says so, and that question is dropped from the conversation.
- Changing minds, or local models, starts a new conversation. What he remembers is kept.

## Permissions

- **macOS:** Look and the screen effects (Slash, Shatter, Glitch, Vortex, Burn, Melt, Soul Rip) need Screen Recording permission to photograph the screen (System Settings → Privacy & Security → Screen Recording). Without it, the effects play over dark glass instead of your real screen, and Look reports that it can't see.
- **macOS:** the first time he controls Spotify, macOS asks whether Reaper may control it (Automation). If you said no, allow it in System Settings → Privacy & Security → Automation.
- **Linux:** transparency needs a compositing window manager, which most desktops have.

## Where things are kept

`companion.json` in the app's user-data folder keeps:

- Settings, soul and the mind you chose.
- The Garden: banked souls, workers, upgrades and milestones reached.
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

To build on your own machine instead, first fetch llama-server for it (`npm run fetch-llama`, or `npm run fetch-llama -- --mac` on a Mac, which builds for both kinds), then run the command for that machine (each writes to `desktop/dist/`):

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
| `oracle.js` | Speak: the conversation with Claude or a local model, its system prompt and tools |
| `freemind.js` | The free mind: downloading its model, and running it in llama-server |
| `tools/fetch-llama-server.mjs` | Fetches llama-server for each platform into `vendor/llama/`; the release workflow runs it before building |
| `screens.js` | Which edges of a monitor lead to another one |
| `ollama.js` | The link to Ollama: finding its models and streaming a chat turn |
| `offline.js` | The plain commands he follows with no model |
| `reach.js` | Speak's reach: web search and page reading, opening apps, finding files, and the guard that keeps him to public addresses |
| `spotify.js` | Spotify control through the app's own scripting on macOS |
| `github.js` | GitHub through the user's `gh` login: reading, and the changes the page asks about first |
| `selfwork.js` | Working on himself: the Terminal script that runs a coding agent on a branch of its own |
| `tools/build-info.mjs` | Records the commit and repository a build comes from, for working on himself |
| `crypt.js` | The Garden's rules (the Crypt, in the code): what deeds are worth, what workers cost and gather, upgrades and milestones |
| `tools/pacing.mjs` | Plays the Garden for weeks as three kinds of user, to tune its numbers |
| `preload.cjs` | The small API the page is allowed to use |
| `renderer/app.js` | Movement, dragging and throwing, resting, sleeping and haunting, the ring, greetings, and which parts of the window take clicks |
| `renderer/abilities.js` | Every ability, and the tool calls Speak makes |
| `renderer/crypt.js` | The Garden's card, with its three tabs, and its workers, seeds, moths and wisps on screen |
| `renderer/speak.js` | The Speak card, choosing a mind, its permission questions and copy buttons |
| `renderer/effects.js` | The screen effects over a picture of the screen: Shatter, Glitch and Soul Rip on a canvas; Vortex, Burn and Melt as WebGL shaders |
| `renderer/sound.js` | The bell, a sound for each screen effect, and Hum |
| `renderer/bridge.js` | The page's link to the app, with a stand-in so it also runs in a browser tab |

## Checks

From this folder:

```bash
npm test
```

This runs these, with no network and no real model:

- `tests/oracle.mjs` tests Speak's conversation loop against a fake API with no real calls.
- `tests/minds.mjs` tests the free mind and Ollama against stand-ins, and the plain commands.
- `tests/engine.mjs` tests how the free mind runs llama-server (starting, streaming, tools, stopping, failing) and downloads its model, against a stand-in server (`tests/fixtures/fake-llama-server.mjs`). Linux and macOS only.
- `tests/crypt.mjs` tests the Garden's rules.

Two more need something extra, so `npm test` leaves them out:

- `tests/roam.mjs` checks roaming between monitors. It needs a desktop of several monitors; `tests/plp-desktop.sh` makes a pretend portrait-landscape-portrait one with X.org's dummy driver (on Debian or Ubuntu: `xserver-xorg-video-dummy` and `x11-xserver-utils`), and CI runs it that way:

  ```bash
  tests/plp-desktop.sh node tests/roam.mjs
  ```

- `tests/freemind.mjs` runs the free mind's real model in the real llama-server, in Node and inside the app. Run `npm run fetch-llama` first, then point it at the downloaded model file:

  ```bash
  REAPER_FREE_MODEL=/path/to/Qwen3-4B-Instruct-2507-Q4_K_M.gguf xvfb-run -a node tests/freemind.mjs
  ```

`tools/bench-models.mjs` scores models for the free mind on Speak's requests, in llama-server as the app runs them: `node tools/bench-models.mjs model.gguf [more.gguf …]`.

Last, `npm test` runs `tests/launch.mjs`, which starts the real app and checks the window, the bridge and the main process.

On Linux without a display, run it under `xvfb-run -a npm test`.

From the repo root, `npm run test:desktop` checks the page itself in a headless browser.
