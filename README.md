# Python → Open Source Roadmap Tracker

A dark-mode, self-hosted recreation of your `python_open_source_progression.md`
roadmap: all 305 topics across 20 levels, each with a status dropdown, a
one-click "done" checkbox, and a colored status indicator — plus the
milestones, parallel tracks, and core-principle sections as reference reading.

Progress is saved to your own Supabase project and gated behind an 8-digit
code instead of a normal username/password.

## Files

| File | Purpose |
|---|---|
| `index.html` | The page itself |
| `styles.css` | Dark theme |
| `roadmap-data.js` | The whole roadmap, parsed from your markdown into data |
| `app.js` | All the interactive logic |
| `config.js` | **Edit this** — your Supabase project URL + anon key |
| `schema.sql` | **Run this** in Supabase once, to create the tables + functions |

## 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) → New project (the free tier is plenty).
2. Once it's up, open **SQL Editor → New query**, paste in the entire contents
   of `schema.sql`, and run it. This creates two tables and three functions —
   see the comments at the top of that file for how the auth model works.
3. Open **Settings → API**. Copy the **Project URL** and the **`anon` `public`**
   key.

## 2. Configure the app

Open `config.js` and paste your values in:

```js
const SUPABASE_URL = "https://xxxxxxxx.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOi...";
```

That's it — no build step, no npm install.

## 3. Run it

Any static file server works, since the browser needs to fetch the `.js`
files over `http(s)://`, not `file://`:

```bash
cd this-folder
python3 -m http.server 8080
# then open http://localhost:8080
```

Or drag the whole folder into a static host — [Vercel](https://vercel.com),
[Netlify](https://netlify.com), [GitHub Pages](https://pages.github.com), or
Supabase's own storage all work with zero configuration since there's nothing
to build.

## How login works

There are no accounts to sign up for in the traditional sense — you just pick
an 8-digit code:

- Typing a code that's never been used **creates** a new progress profile.
- Typing the same code again **logs back into** that same profile.

The digits never leave your browser in plain text: they're hashed
(SHA-256) client-side first, and only the hash is sent to Supabase. **This is
a lightweight PIN, not real security** — anyone who knows or guesses your 8
digits can open your profile, since there's no rate limiting on guesses at
this scale. It's meant for a solo learning tracker, not for anything
sensitive. If you want real security later, swap this out for Supabase Auth
(email/password or magic link) — the `roadmap_progress` table doesn't care
where `user_id` comes from.

**Keep me logged in**, when on, stores the hash in `localStorage` so it
survives closing the browser entirely. Off, it uses `sessionStorage` instead,
so it's forgotten once you close the tab.

## Customizing

- **Status categories / colors**: edit the `STATUS` object at the top of
  `app.js`, and the matching `--st-0` … `--st-4` variables in `styles.css`.
- **Roadmap content**: `roadmap-data.js` is plain JSON assigned to
  `ROADMAP_DATA` — edit topic titles/items directly, or regenerate it from an
  updated markdown file if you tell me to.
- **"Done" threshold**: right now the checkbox marks a topic "Comfortable"
  when checked. Change `DONE_STATES` in `app.js` if you'd rather the checkbox
  mean "Can teach / explain" instead.
