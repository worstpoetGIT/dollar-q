$? (did I spend?) - iPhone build package

WHAT THIS IS
The complete iPhone project for the app. The web app is already bundled inside it.
You do not need Node or npm on the Mac. You need Xcode and internet (first build only).

OPTION A - one command (recommended)
1. Unzip this folder anywhere on the Mac.
2. Open Terminal, drag the unzipped folder in after typing "cd ", press Return.
3. Run:   ./build-ios.sh
4. It produces DollarQ-unsigned.ipa in the same folder.
5. Open iLoader, sign in with your Apple ID, choose that .ipa, install to the iPhone.
If it fails, send back the file build-log.txt.

OPTION B - Xcode
1. Open ios/App/App.xcodeproj in Xcode.
2. Wait for "Resolving packages" to finish.
3. Select the App target > Signing & Capabilities > pick your Apple ID team.
4. Plug in the iPhone, select it at the top, press Run.

NOTES
- Keep the folder structure as it is. The project needs the node_modules folder beside ios/.
- App name on the phone: $?    Bundle ID: win.fridayai.dollarq    iPhone only, portrait.
- A free Apple ID install lasts 7 days, then needs re-signing. Data is stored on the iPhone only;
  deleting the app deletes the data.
