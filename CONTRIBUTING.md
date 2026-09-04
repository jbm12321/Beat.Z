# Contributing to Beat.Z

Thanks for helping improve Beat.Z.

## Before opening a pull request

1. Create a focused branch from `main`.
2. Keep changes within one clear purpose and preserve the browser/native DSP contract.
3. Add or update tests when behavior changes.
4. Run the full verification suite:

   ```bash
   npm ci
   npm test
   npm run test:native
   npx tsc --noEmit
   npm run lint
   npm run build:web
   ```

   Release maintainers should also run `npm run build` with the pinned Faust 2.85.9 toolchain.

5. Do not commit `.env` files, credentials, private audio, generated VST3 bundles, local worker output, or Devpost workflow state.

## Licensing

By submitting a contribution, you agree that your contribution is licensed under the repository's [MIT License](LICENSE). Do not add third-party code, DSP, fonts, samples, impulse responses, or other assets without documenting their source and compatible license in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Use public issues for ordinary bugs and feature requests. Follow [SECURITY.md](SECURITY.md) for vulnerabilities.
