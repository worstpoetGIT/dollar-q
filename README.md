# $?

*(did I spend?)*

<!-- screenshot: hero, the home map with a few buildings grown -->

### App Idea

Apps like Splitwise, Revolut, etc., can be expense trackers only to an extent. I got bored of subscribing to different money tracking apps, not because I'm afraid of where my money is going. So I decided to build my own expense tracker, and I named it "$?" (which means did I spend?).

You put in the expenses you make, under different categories, with different payment methods, for how many people that expense was made, and in different currencies, to keep track of, of course, where your money is going! I built it myself because I'm broke, and because I'm broke I didn't want to pay for subscriptions or for an Apple developer account. There's no option to set a budget in this app, so instead of noting expenses down on Notepad, I tried to build this!

Everything you type stays on your phone. There's no server, no account, no login, no ads.

### Opening the app

The app icon is a circle, with a green "$" and a red "?". When you open the app, the opening animation draws the circle, then the "?" in red, and finally the "$" in green. Then the app opens.

<!-- screenshot: splash -->

The first screen asks you to name your state, let's say Worst Poet's State. The sign on the house stays blank until you start typing, and then it says *Welcome to the state of* whatever you typed. Instead of "Continue", the button says **"Enter without Roaming charges"**.

<!-- screenshot: name screen with a name typed -->

After that the app asks you to set up four things, one at a time:

1. **Counties**: your categories of expenditure. There are 12 to start with and you can rename, regroup, add and delete them (maximum 12).
2. **Payment cultures**: how you pay. Bank Transfer, Debit Card, Credit Card, Cash, with a maximum of 5 sub-items for each (Bank 1, Bank 2, Card 1, Card 2...).
3. **Accounts**: maximum 5, each with only one currency. Say I spend in EUR and INR, then I create two accounts and log both under the same state.
4. **Fixed expenses**: you can skip this one.

### Home Page

The home page is a map of your state, filled with counties. The default counties are:

1. Home & Rent
2. Utilities
3. Subscriptions
4. Banking
5. Groceries
6. Restaurants
7. Cafes
8. Transit
9. Miscellaneous
10. Entertainment
11. Electronics
12. Fashion

On top there are circles which filter the counties:

1. Food: Restaurants, Groceries, Cafes
2. Home: Rent, Utilities
3. Media: Subscriptions, Entertainment
4. Shopping: Fashion, Electronics
5. Other: whatever is left

The whole map is made with Three.js and the animations are made with Lenis. It can be turned any way you like with one finger, zoomed with two fingers, and tapping a county shows a card with **Add** and **History**. The card at the bottom says **"All State"**, *Spending breakdown by county*.

<!-- screenshot: home map -->
<!-- screenshot: a county selected, with the bottom card -->

**The buildings grow.** When you add an expense, that county's building doesn't just pop up bigger, it gets constructed slowly, with a crane on the lot. A small amount gets a small upgrade (an empty plot, then a foundation, then a hut, then a proper building, then a fence and a flag). A bigger amount keeps going: extra buildings next to it, then more floors, and there's no maximum height. So the amount I enter decides how big the county gets. At the start of every month, all the counties go back to empty plots.

**There are people and vehicles.** People walk around the streets, really moving their arms and legs, and cars, buses and vans drive in from one end of the road and leave from the other.

**Maps.** The button on the top right changes the whole map, everything on it, the ground, the buildings, the vehicles, the people, the trees and the sky:

1. Classic City
2. Lego
3. Japan (anime look)
4. Ice Age
5. Wireframe
6. Warzone
7. Under the Ocean
8. Basketball Court

<!-- screenshot: map picker -->
<!-- screenshot: two or three other maps -->

### Adding an expense

The big **+** in the middle opens a number pad. You pick the county, the account (which sets the currency), the payment method, how many people the expense was for, the date, and an optional note. Every tap has a little haptic.

<!-- screenshot: add expense keypad -->

### Analytics Page

Analytics shows a graph of the expenses made in that month, with the days split into 1 to 15 and 16 to the end of the month. It also shows **last month** and the **difference** between last month and this month, the last 6 months, and the top counties.

<!-- screenshot: analytics -->

### History

All the expenditures from the current month and previous months are in the History tab. You can go month by month, filter by county, or press the search button and type a keyword to search every month at once. To delete an expense, **swipe it to the left** and tap Delete.

<!-- screenshot: history, ideally mid-swipe -->

### Profile

1. **Accounts**: maximum 5, one currency each (12 currencies to choose from).
2. **Fixed Expenses & Subscriptions**: things like Claude or ChatGPT, where money is debited from your account on a specific day. Add them once and the app logs them every month, so you don't have to.
3. **Manage Counties & Payment Methods**: add, rename and delete counties and payment methods.
4. **Appearance**: System, Light or Dark. Light is all white, Dark is all black.
5. **Data**: export a backup file and import it back. More on this below.

<!-- screenshot: profile -->

### What's not in the app, on purpose

- No budgets and no monthly goal.
- No income. This only tracks what you spend.
- No settings button, no streaks, no mini analytics.
- No account, no login and no cloud. Nothing leaves your phone.

### Install

Download the files from the [Releases](../../releases) page.

**Android**

1. Download `DollarQ.apk` and open it. If Android asks, allow "install unknown apps" for your browser or file manager.
2. It's signed with one fixed key, so later versions install over the top and your data stays.

**iPhone**

The iPhone file is **not signed**, because Apple only lets you run signed apps and I'm not paying them for that. You sign it yourself with a sideloading tool and your own free Apple ID. I use [iLoader](https://github.com/nab138/iloader).

1. Download `DollarQ-unsigned.ipa` on a computer.
2. Open iLoader, sign in with your Apple ID, choose the `.ipa`, and install it to your iPhone.
3. If iOS asks, trust the app in Settings, General, VPN & Device Management.
4. A free Apple ID signature lasts **7 days**. After that you do step 2 again, installing over the top with the same Apple ID, so your data stays.

### Where your data lives

Only on your phone. If you delete the app, the data goes with it, so use **Profile, Data, Export backup** now and then. It makes a `.json` file you can save to Files or AirDrop to yourself, and **Import backup** brings everything back. Importing asks you before it replaces anything and keeps one undo.

### Security

I tried to attack my own app before sharing it, and fixed what I found:

- Everything saved on the phone is checked every time the app opens (types, lengths, allowed values, size limits), so a broken or edited backup can't crash it or sneak anything in.
- A strict content security policy only lets the app run its own code and talk to nothing else.
- Imported backup files are treated as untrusted, and shown to you before they replace anything.
- Android's cloud backup is switched off.

If you find something I missed, open an issue.

### Build it yourself

You need Node 22 or newer.

```bash
npm ci
npm run dev          # preview in the browser
npx vite build       # web build into dist/
```

The Android and iPhone builds run on GitHub Actions (`.github/workflows/build.yml`), because my MacBook doesn't have the space for Xcode. They produce two unsigned files:

- **Android:** `npx cap sync android`, then `./gradlew assembleRelease` inside `android/`. I sign the APK on my own machine with a key that never gets uploaded anywhere. To sign your own build: `zipalign -c 4 app.apk`, then `apksigner sign --ks your.p12 --out DollarQ.apk app.apk`.
- **iPhone:** `npx cap sync ios`, then `./build-ios.sh` on a Mac with Xcode. It gives you the unsigned `.ipa`.

Releases are put together by hand, with the signed APK and the unsigned IPA attached.

### Built with

React, Vite, Three.js (the map), Lenis (smooth scrolling) and Capacitor (the Android and iPhone shells, with the Haptics, Preferences, Filesystem and Share plugins).

### Contributors

- [worstpoetGIT](https://github.com/worstpoetGIT)
- [asif-reh](https://github.com/asif-reh)

### License

[MIT](LICENSE)
