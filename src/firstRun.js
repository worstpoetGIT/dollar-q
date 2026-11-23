// which screen comes first when the app opens, in one place so it can be tested.
//   splash, then (once we know whether this phone is signed in) the email page, then the name page, then the setup pages, then the app.
// the email page comes first every time the app starts fresh, "Not now" only keeps it away for an app that is already set up.
export function firstRunScreen({ splash, phase, working, entered, setupDone, skippedNow, skippedBefore, editName }) {
  if (splash) return 'splash'
  // still finding out (or still pulling this account's data onto a new phone): show nothing yet, so the wrong page never flashes
  if (phase === 'starting' || (phase === 'idle' && working && !entered)) return 'wait'
  const notSignedIn = phase === 'signedOut' || phase === 'codeSent' || phase === 'choosing'
  if (notSignedIn && !skippedNow && (!entered || !skippedBefore)) return 'email'
  if (!entered || editName) return 'name'
  if (!setupDone) return 'wizard'
  return 'app'
}

// is there an email page before this one? (then the name page gets a back button)
export const hasEmailPage = (phase) => phase === 'signedOut' || phase === 'codeSent' || phase === 'choosing'
