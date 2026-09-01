# Public VST3 Storage setup

1. In Supabase Storage, create a **public** bucket called `vst3-builds`.

2. Set this on both the Site runtime and the Mac worker:

   ```bash
   VST3_ARTIFACT_PUBLIC_URL=https://YOUR_PROJECT.supabase.co/storage/v1/object/public/vst3-builds
   ```

3. Set these only on the Mac worker:

   ```bash
   VST3_ARTIFACT_BUCKET=vst3-builds
   SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
   ```

`SUPABASE_SERVICE_ROLE_KEY` is private. Keep it out of browser code, Site runtime variables, Git, and committed `.env` files.

Every completed plugin is deliberately downloadable at its public URL. The download is a ZIP containing the macOS `.vst3` bundle.
