# Dylan Dyal — personal webspace

Y2K-style portfolio: WebGL fluid background, a Web Audio synth, a draggable ghost, and a public guestbook. Hosted with GitHub Pages from `main`.

Live: https://dylan3737.github.io/y2k-site/

## Guestbook

`script.js` talks to Supabase with the public anon key. That key is not a secret. Row level security is. The tables, length checks, and a 3-posts-per-10-minutes limit per IP live in [`supabase/schema.sql`](supabase/schema.sql).

Run that file in the Supabase SQL editor after pulling. It also deletes the throwaway rows left behind while reviewing write access (guestbook ids 2, 5–10 and song id 1, matched on their exact text so a reused id is left alone).
