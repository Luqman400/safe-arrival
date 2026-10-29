# Safe Arrival (Supabase)
1. Paste your anon public key into `.env` (Supabase > Project Settings > API Keys). Never use the service_role key here.
2. Supabase > SQL Editor: run `supabase/schema.sql`.
3. Supabase > Authentication: turn OFF "Allow new users to sign up", then Add user (tick Auto Confirm).
4. `npm install` then `npm run dev`, open http://localhost:5173 and sign in.
SMS/WhatsApp and Vercel come next. `.env` is git-ignored, so it never reaches GitHub.
