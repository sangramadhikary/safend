// Makes the `google.maps.*` namespace from `@types/google.maps` globally
// available. The Maps JS SDK is loaded at runtime via @googlemaps/js-api-loader,
// so the `google` global exists in the browser but has no ambient declaration
// unless the types are referenced. A per-file triple-slash reference is
// unreliable under `moduleResolution: "bundler"`, so anchor it here where it is
// picked up as part of the project's global scope.
/// <reference types="google.maps" />

export {};
