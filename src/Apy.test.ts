import assert from 'node:assert/strict'
import test from 'node:test'
import { computeApy, computeLatestApy } from './Apy'

// Real mainnet figures from the first two-round release, 2026-09-08. Keeping the actual numbers
// means a change in this arithmetic shows up as a change in a rate someone published, not as an
// abstract failure.
const mainnet = {
    previousRate: 1_163_839_627n,
    midRate: 1_164_156_495n,
    currentRate: 1_164_402_398n,
    windowDuration: 131_072n,
    midRound: 1_788_694_280n,
    lastSettledRound: 1_788_759_816n,
}

void test('annualises the published window to the figure that went out', () => {
    const apy = computeApy(mainnet)
    assert.ok(apy !== null)
    assert.ok(Math.abs(apy - 0.1233) < 0.0005, `expected ~12.33%, got ${(apy * 100).toFixed(2)}%`)
})

void test('the single-release reading is a different, noisier number', () => {
    const latest = computeLatestApy(mainnet)
    assert.ok(latest !== null)
    assert.ok(Math.abs(latest - 0.107) < 0.001, `expected ~10.70%, got ${(latest * 100).toFixed(2)}%`)

    // The whole point of the two-round window. If these ever agree closely the smoothing has
    // stopped doing anything, which is worth failing over.
    const apy = computeApy(mainnet)
    assert.ok(apy !== null)
    assert.ok(Math.abs(apy - latest) > 0.01)
})

// The error this helper exists to prevent, asserted rather than described: a consumer that reached
// for a round length instead of windowDuration published roughly the square of the real figure.
void test('halving the window is not halving the APY -- it roughly squares it', () => {
    const oneRound = computeApy({ ...mainnet, windowDuration: mainnet.windowDuration / 2n })
    const real = computeApy(mainnet)
    assert.ok(oneRound !== null)
    assert.ok(real !== null)
    assert.ok(oneRound > real * 2, `expected the wrong denominator to overstate badly, got ${String(oneRound)}`)
})

void test('a treasury that has never settled reports nothing rather than a wrong number', () => {
    assert.equal(computeApy({ previousRate: 0n, currentRate: 1_000_000_000n, windowDuration: 65_536n }), null)
    assert.equal(computeApy({ previousRate: 1_000_000_000n, currentRate: 1_000_000_000n, windowDuration: 0n }), null)
    assert.equal(
        computeLatestApy({ midRate: 0n, currentRate: 1n, midRound: 0n, lastSettledRound: 1n }),
        null,
    )
    // midRound == lastSettledRound is a zero-length interval, not a division by a small number.
    assert.equal(
        computeLatestApy({ midRate: 1n, currentRate: 2n, midRound: 5n, lastSettledRound: 5n }),
        null,
    )
})

void test('a flat rate is zero growth, not null', () => {
    const apy = computeApy({ previousRate: 1_000_000_000n, currentRate: 1_000_000_000n, windowDuration: 131_072n })
    assert.equal(apy, 0)
})
