# Building the hosted editor module

The deployed editor component must resolve public image paths against its delivered
module URL. A build-machine hostname is not an asset origin after deployment.
Authored page data and external image URLs must not be rewritten to compensate.

`editor-source.json` pins the reviewed source commit and exact output SHA-256.
`pnpm build:client` first builds that source with its frozen dependency lock, verifies
the component module and checks that the existing stylesheet and component schema
are unchanged. Only then is the generated module placed in the public directory.
The published site's source and the pending editor-source migration are not merged.

The new generated module is build output rather than a maintained source file.
Previously committed module files remain available for already-open editor pages.
The endpoint's module filename and the pinned build descriptor must agree; the
artifact tests check this agreement and the full module and manifest digests.
The build also compares the stylesheet bytes with the existing committed copy.

Use Node 24 and pnpm 10.14.0. Heavy builds and browser tests run in CI or on RunPod.
After building, run `pnpm test:editor-artifacts`, the unit suite and type checking.
A changed digest, stylesheet or component schema fails the build rather than
silently replacing a different artifact.

For offline verification, `EDITOR_BUILD_SOURCE_REPOSITORY` can name a local Git
mirror. It changes only the fetch transport: the exact commit and output digest
are still required. Publish the reviewed source commit before merging a production
change that refers to it; a normal production build fetches the canonical repository.
