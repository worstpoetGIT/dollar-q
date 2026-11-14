# $?  (did I spend?)

A private, offline expense tracker where your spending builds a miniature 3D state.
Every spending category is a **county**. Spend in it and the building on that county grows,
one construction step at a time. Everything you enter stays on your phone.

<!-- SCREENSHOTS-HERO -->

## Features

- **Your own state.** Name it, name your counties (categories), and watch them grow as you spend.
- **A map that builds itself.** A new expense starts a small construction: a foundation, a hut,
  details, extra buildings, then more floors. Bigger amounts build bigger. There is no ceiling.
- **Eight map skins**, each restyling the ground, buildings, vehicles, people, trees and sky:
  Classic City, Lego, Japan (anime look), Ice Age, Wireframe, Warzone, Under the Ocean, Basketball Court.
- **Add an expense in seconds** with a large keypad: county, account, payment method, people, date, note.
- **Multiple accounts and currencies** (up to 5, one currency each).
- **Fixed expenses and subscriptions** that log themselves on their day.
- **Analytics** with the month compared to the last, and the month split into days 1 to 15 and 16 to the end.
- **History** across all months, with search, county filters and swipe-to-delete.
- **System, Light and Dark** appearance. Light is all white, Dark is all black.
- **Haptics** on every tap. **Export and import** your data as a single backup file.
- No accounts, no sign-in, no tracking, no ads, and no expense data ever leaves the device.

<!-- SCREENSHOTS-FEATURES -->

## Install

Download the files from the [Releases](../../releases) page.

### Android
1. Download `DollarQ.apk` and open it. Allow "install unknown apps" for your browser or file manager if asked.
2. The app is signed with a fixed key, so later versions install over the top and keep your data.

### iPhone
The iPhone file is **unsigned**. Apple only lets you run apps that are signed, so you sign it yourself
with a sideloading tool and your own Apple ID, for example [iLoader](https://github.com/nab138/iloader).

1. Download `DollarQ-unsigned.ipa` on a computer.
2. Open iLoader, sign in with your Apple ID, choose the `.ipa`, and install it to your iPhone.
3. Trust the app in Settings, General, VPN & Device Management, if iOS asks.
4. A free Apple ID signature lasts **7 days**. Repeat step 2 each week, installing over the top
   with the same Apple ID so your data stays.

## Your data

Everything is stored on the device. There is no server and no account.
Use **Profile, Data, Export backup** to save a `.json` file, and **Import backup** to restore it.
Deleting the app deletes its data, so keep a backup.

## Security notes

- Stored data is validated on every launch (types, lengths, allowed values and size limits), so a damaged
  or tampered backup cannot crash the app or inject content.
- A strict content security policy blocks any script or connection that is not part of the app.
- Imported backup files are treated as untrusted input and shown for confirmation before they replace anything.
- Android backups to cloud services are switched off.

## Build from source

Needs Node 22 or newer.

```bash
npm ci
npm run dev          # local preview
npx vite build       # production web build into dist/
```

Native builds run in GitHub Actions (see `.github/workflows/build.yml`):

- **Android:** `npx cap sync android`, then `./gradlew assembleRelease` in `android/`. Release signing reads
  `ANDROID_KEYSTORE_B64` and `ANDROID_KEYSTORE_PASSWORD` from repository secrets.
- **iPhone:** `npx cap sync ios`, then `./build-ios.sh` on a Mac with Xcode. The script produces an unsigned `.ipa`.

To publish a release, push a tag such as `v0.1.0`. The workflow builds both apps and attaches them to a release.

## Built with

React, Vite, Three.js (the 3D map), Lenis (smooth scrolling), and Capacitor (the Android and iOS shells,
with the Haptics, Preferences, Filesystem and Share plugins).

## License

[MIT](LICENSE)
