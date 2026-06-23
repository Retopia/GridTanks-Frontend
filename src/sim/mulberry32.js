// Tiny deterministic PRNG. Used so the headless JS sim and the Python sim can
// be seeded identically for conformance testing (their enemy AI consumes
// randomness, so matching streams is required to compare trajectories).
// Returns a function producing floats in [0, 1).
export function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
