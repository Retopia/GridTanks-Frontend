// Seedable RNG for *gameplay* randomness (enemy shot timing, the AI's
// shoot-decision roll, safe-destination tie-breaks). Defaults to Math.random,
// so normal play is unchanged; seeding it (for conformance testing against the
// headless sim) makes the game deterministic.
//
// Only gameplay-affecting calls route through here. Cosmetic randomness
// (explosion particles, screen shake, sound) deliberately stays on Math.random
// so it doesn't consume from — and desync — the seeded gameplay stream that the
// headless sim mirrors.
import { mulberry32 } from '../sim/mulberry32.js';

let _rand = Math.random;

export function rand() {
    return _rand();
}

export function seedGameRandom(seed) {
    _rand = mulberry32(seed);
}

export function clearGameRandom() {
    _rand = Math.random;
}
