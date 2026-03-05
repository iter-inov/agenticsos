

## Diagnostic: Google OAuth 403 access_denied

**Root cause**: The scope `gmail.modify` is classified as **restricted** by Google. Even with test users configured, restricted scopes require additional verification steps in Google Cloud Console (security assessment, etc.). This is likely why you still get 403.

## Plan: Reduce Gmail scope to non-restricted

Replace `gmail.modify` (restricted) with `gmail.readonly` (sensitive but not restricted) in the edge function. This should unblock the consent screen immediately.

If your app needs to send emails later, we can add `gmail.send` separately (also restricted, but we can handle it incrementally).

### Changes

**1. Update `supabase/functions/google-oauth-start/index.ts`**
- Change `https://www.googleapis.com/auth/gmail.modify` to `https://www.googleapis.com/auth/gmail.readonly`

**2. Update scopes in Google Cloud Console (manual)**
- In OAuth consent screen > Scopes, replace `gmail.modify` with `gmail.readonly`
- Save and wait ~1 minute for propagation

### Alternative if it still fails

If `gmail.readonly` also triggers 403, we can temporarily remove all Gmail/Drive/Calendar scopes and use only `userinfo.email` + `openid` to confirm the OAuth flow works end-to-end, then add scopes back one by one.

