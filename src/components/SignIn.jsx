import Account from './Account.jsx'

// the first thing after the opening animation: sign in with your email. it can be skipped, and it is in Profile too.
export default function SignIn({ onSkip }) {
  return (
    <div className="lime email">
      <div className="body">
        <h1 className="fade-up">Sign in to<br />keep your<br />data safe.</h1>
        <p className="muted" style={{ margin: '4px 0 18px', fontSize: 19.2 }}>Your expenses sync between your phones, and come back if you lose this one.</p>
        <Account />
      </div>
      <div className="foot">
        <button className="btn" onClick={onSkip}>Not now</button>
      </div>
    </div>
  )
}
