import type { TreasuryConfig } from './Treasury'

const yearSeconds = 365 * 24 * 60 * 60

/** The fields {@link computeApy} reads. A whole `TreasuryConfig` satisfies it. */
export type RateWindow = Pick<TreasuryConfig, 'previousRate' | 'currentRate' | 'windowDuration'>

/** The fields {@link computeLatestApy} reads. A whole `TreasuryConfig` satisfies it. */
export type LatestRateWindow = Pick<TreasuryConfig, 'midRate' | 'currentRate' | 'midRound' | 'lastSettledRound'>

/**
 * Annualised growth of the exchange rate, as a fraction: `0.17` is 17%. `null` when the treasury
 * has not published a window yet.
 *
 * **This is the figure to display.** It spans the treasury's last two settlement releases, so it is
 * smoothed across two rounds and does not swing with which round chain happened to lend.
 *
 * The denominator is `windowDuration`, and using anything else is the mistake this function exists
 * to stop. It is NOT a round length: it is about two rounds, and wider still across rounds the pool
 * did not lend into. Dividing the year by a round length instead roughly SQUARES the result -- a
 * ~17% pool printing as ~37% -- and that has actually shipped. It would also report an unchanged
 * APY for a pool that had fallen to validating every other round, whose true growth had halved,
 * because the rates only move when a round the pool lent into settles.
 */
export function computeApy(state: RateWindow): number | null {
    return annualise(state.previousRate, state.currentRate, state.windowDuration)
}

/**
 * The same thing measured over the SINGLE most recent settlement release rather than two, as a
 * fraction. `null` when there is no such interval yet.
 *
 * Noisier by design, and usually not what you want on a dashboard: consecutive readings differ by
 * whole percentage points purely from round imbalance. Reach for it when you want the newest reward
 * on its own -- checking whether the latest round paid unusually well or badly, say -- rather than
 * a rate to quote. Expect it to disagree with {@link computeApy}; that gap is the smoothing, not an
 * inconsistency.
 */
export function computeLatestApy(state: LatestRateWindow): number | null {
    return annualise(state.midRate, state.currentRate, state.lastSettledRound - state.midRound)
}

function annualise(from: bigint, to: bigint, seconds: bigint): number | null {
    // A treasury that has never settled reports zeros here rather than an error, so these are the
    // ordinary early-life case, not corruption.
    if (from <= 0n || seconds <= 0n) {
        return null
    }
    const growth = Number(to) / Number(from)
    if (!(growth > 0)) {
        return null
    }
    return Math.pow(growth, yearSeconds / Number(seconds)) - 1
}
