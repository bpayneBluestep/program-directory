# program-directory

Static SPA deployable as a BlueStep GitSite. Routes live at the host root
(`/`, `/claim/:id`, `/portal`, `/admin`); only the built assets sit under `/spa/`.

## Commands

```bash
npm install       # install dependencies
npm run build     # emit index.html + assets/ at the repo root (this IS the deployed artifact)
```

Push to `main` and the BlueStep GitSite auto-deploys. Browse at
`https://programdirectory.bluestep.net/`.

## How reps sign in

Program reps are **Program Directory accounts**, not BlueStep users (an interim
setup until BlueStep ships a native invite flow).

1. **Claim** (`/claim/:id`): name + work email, then a 6-digit code by email.
2. **New email**: "Create your sign-in" (username + password, at least 10
   characters). The account is created and the rep lands in `/portal`, already
   signed in. **Email that already has an account**: the program is added to it
   and the rep signs in.
3. **Sign in** (`/portal`): username or email + password. 5 wrong tries lock the
   account for 15 minutes. "Forgot your password?" emails a reset code.
4. **Session**: `/b/claim` returns a token, stored in `localStorage` (`pd.session`)
   and sent as the `X-PD-Session` header to `/b/portal` and `/b/claim`. It ends
   3 hours after sign-in, with no renewal.

BlueStep super users still reach `/admin` (and edit any program) through their
real BlueStep login.

**reCAPTCHA v3** (invisible) guards claim, new-listing requests, sign-up, sign-in
and password reset. The site key is in `app/src/api.ts`. The secret lives only
in the `/b/claim` endpoint on the directory org.
