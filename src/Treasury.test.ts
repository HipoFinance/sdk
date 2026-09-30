import assert from 'node:assert/strict'
import test from 'node:test'
import { Address, beginCell, Cell, Dictionary, TupleReader, type ContractProvider, type TupleItem } from '@ton/core'
import { computeApy } from './Apy'
import { Treasury, participationDictionaryValue, requestDictionaryValue } from './Treasury'

// get_treasury_state returns a FLAT TUPLE that this SDK reads by position, and every consumer
// downstream inherits those positions. When the treasury inserted `deficit` at index 5 it shifted
// everything after it, and four repositories broke at once -- two of them live user-facing sites --
// because nothing anywhere asserted what each slot means. This is that assertion.
//
// The treasury only grows this tuple by APPENDING now, which is what lets a field be added without
// a coordinated release. A change here means that promise was broken and every positional reader in
// the fleet needs checking, not that this test needs updating.

const someAddress = Address.parse('EQCLyZHP4Xe8fpchQz76O-_RmUhaVc_9BAoGyJrwJrcbz2eZ')
const otherAddress = Address.parse('EQDPdq8xjAhytYqfGSX8KcFWIReCufsB9Wdg0pLlYSO_h76w')

// A non-empty direct dictionary, because loadDirect has no empty root to parse.
function dictCell(): Cell {
    const d = Dictionary.empty(Dictionary.Keys.BigUint(32), Dictionary.Values.Cell())
    d.set(1n, beginCell().storeUint(0, 8).endCell())
    return beginCell().storeDictDirect(d).endCell()
}

const int = (value: bigint): TupleItem => ({ type: 'int', value })
const slice = (address: Address): TupleItem => ({ type: 'slice', cell: beginCell().storeAddress(address).endCell() })
const cell = (c: Cell): TupleItem => ({ type: 'cell', cell: c })
const nil: TupleItem = { type: 'null' }

// Deliberately distinct values, so a one-slot shift cannot coincidentally still pass.
const items: TupleItem[] = [
    int(1n), // 0  total_coins
    int(2n), // 1  total_tokens
    int(3n), // 2  total_staking
    int(4n), // 3  total_unstaking
    int(5n), // 4  total_borrowers_stake
    int(6n), // 5  deficit
    slice(otherAddress), // 6  parent
    nil, // 7  participations
    int(255n), // 8  rounds_imbalance
    int(0n), // 9  stopped
    int(-1n), // 10 instant_mint
    cell(dictCell()), // 11 loan_codes
    int(1_163_839_627n), // 12 previous_rate
    int(1_164_402_398n), // 13 current_rate
    int(131_072n), // 14 window_duration
    int(1_788_759_816n), // 15 last_settled_round
    slice(someAddress), // 16 halter
    slice(otherAddress), // 17 governor
    nil, // 18 proposed_governor
    int(4_096n), // 19 governance_fee
    int(32_767n), // 20 borrower_fee
    cell(dictCell()), // 21 collection_codes
    cell(dictCell()), // 22 bill_codes
    nil, // 23 old_parents
    int(1_164_156_495n), // 24 mid_rate
    int(1_788_694_280n), // 25 mid_round
]

function providerReturning(stack: TupleItem[]): ContractProvider {
    return {
        get: () => Promise.resolve({ stack: new TupleReader([...stack]) }),
    } as unknown as ContractProvider
}

void test('every get_treasury_state field is read at its established position', async () => {
    const treasury = Treasury.createFromAddress(someAddress)
    const s = await treasury.getTreasuryState(providerReturning(items))

    assert.equal(s.totalCoins, 1n)
    assert.equal(s.totalTokens, 2n)
    assert.equal(s.totalStaking, 3n)
    assert.equal(s.totalUnstaking, 4n)
    assert.equal(s.totalBorrowersStake, 5n)
    assert.equal(s.deficit, 6n)
    assert.equal(s.parent?.toString(), otherAddress.toString())
    assert.equal(s.roundsImbalance, 255n)
    assert.equal(s.stopped, false)
    assert.equal(s.instantMint, true)
    assert.equal(s.previousRate, 1_163_839_627n)
    assert.equal(s.currentRate, 1_164_402_398n)
    assert.equal(s.windowDuration, 131_072n)
    assert.equal(s.lastSettledRound, 1_788_759_816n)
    assert.equal(s.halter.toString(), someAddress.toString())
    assert.equal(s.governor.toString(), otherAddress.toString())
    assert.equal(s.proposedGovernor, null)
    assert.equal(s.governanceFee, 4_096n)
    assert.equal(s.borrowerFee, 32_767n)

    // Appended at the end, though the treasury stores them beside the rate pair. Reading them last
    // is what let that release ship without touching a single consumer.
    assert.equal(s.midRate, 1_164_156_495n)
    assert.equal(s.midRound, 1_788_694_280n)
})

void test('the state it parses is the state the APY helpers expect', async () => {
    const treasury = Treasury.createFromAddress(someAddress)
    const s = await treasury.getTreasuryState(providerReturning(items))
    const apy = computeApy(s)
    assert.ok(apy !== null)
    assert.ok(Math.abs(apy - 0.1233) < 0.0005)
})

void test('a treasury older than this SDK throws rather than returning shifted numbers', async () => {
    const treasury = Treasury.createFromAddress(someAddress)
    // 24 values: the shape before mid_rate and mid_round were appended.
    await assert.rejects(() => treasury.getTreasuryState(providerReturning(items.slice(0, 24))))
})

// get_loan_request leads with a found flag, then the stage, and ends with max_stake. These are the
// tuples the treasury returns, value for value.
const loanRequestTuple = (found: boolean, stage: bigint, maxStake: bigint): TupleItem[] => [
    int(found ? -1n : 0n), // found?
    int(stage), // stage
    int(933_333_331_153n), // min_payment
    int(1799n), // borrower_reward_share
    int(300_000_000_000_000n), // loan_amount
    int(399_999_998_365_398n), // accrue_amount
    int(501_000_000_000n), // stake_amount
    int(0n), // request_fee
    int(maxStake), // max_stake
]

void test('get_loan_request is read from its found flag, not one position off', async () => {
    const treasury = Treasury.createFromAddress(someAddress)
    const r = await treasury.getLoanRequest(providerReturning(loanRequestTuple(true, 2n, 0n)), 1n, otherAddress)
    assert.deepEqual(r, {
        stage: 2,
        minPayment: 933_333_331_153n,
        borrowerRewardShare: 1799n,
        loanAmount: 300_000_000_000_000n,
        accrueAmount: 399_999_998_365_398n,
        stakeAmount: 501_000_000_000n,
        requestFee: 0n,
        maxStake: 0n,
    })
})

void test('get_loan_request reads max_stake', async () => {
    const treasury = Treasury.createFromAddress(someAddress)
    const r = await treasury.getLoanRequest(
        providerReturning(loanRequestTuple(true, 0n, 400_000_000_000_000n)),
        1n,
        otherAddress,
    )
    // stage 0 is participation::open: a request that is found, which the old not-found test got wrong
    assert.ok(r)
    assert.equal(r.stage, 0)
    assert.equal(r.maxStake, 400_000_000_000_000n)
})

void test('get_loan_request is undefined when the treasury says not found', async () => {
    const treasury = Treasury.createFromAddress(someAddress)
    const notFound = [int(0n), int(0n), int(0n), int(0n), int(0n), int(0n), int(0n), int(0n), int(0n)]
    assert.equal(await treasury.getLoanRequest(providerReturning(notFound), 1n, otherAddress), undefined)
})

void test('a stored request round-trips with and without max_stake', () => {
    const base = {
        minPayment: 400_000_000_000n,
        borrowerRewardShare: 1799n,
        loanAmount: 300_000_000_000_000n,
        accrueAmount: 0n,
        stakeAmount: 501_000_000_000n,
        requestFee: 0n,
        newStakeMsg: beginCell().storeUint(7, 8).endCell(),
    }
    for (const request of [base, { ...base, maxStake: 0n }, { ...base, maxStake: 400_000_000_000_000n }]) {
        const b = beginCell()
        requestDictionaryValue.serialize(request, b)
        const parsed = requestDictionaryValue.parse(b.endCell().beginParse())
        assert.deepEqual(
            { ...parsed, newStakeMsg: parsed.newStakeMsg.hash() },
            { ...request, newStakeMsg: request.newStakeMsg.hash() },
        )
    }
})

// A participation's `rejected`, `accepted` and `accrued` dicts are the treasury's internal working state
// during a loan decision, and their layout can change with the contract (accepted is keyed by 416 bits
// since the auction-floors release, 256 before). The SDK keeps all three as opaque cells, so a
// participation parses whatever that layout is, and writes it back byte for byte.
void test('keeps a participation’s rejected, accepted and accrued dicts opaque, whatever their key width', () => {
    const rejected = Dictionary.empty(Dictionary.Keys.BigUint(200), Dictionary.Values.Uint(8))
    rejected.set(9n, 3)
    const rejectedCell = beginCell().storeDictDirect(rejected).endCell()
    const accepted = Dictionary.empty(Dictionary.Keys.BigUint(416), Dictionary.Values.Uint(8))
    accepted.set((5n << 256n) + 123n, 1)
    const acceptedCell = beginCell().storeDictDirect(accepted).endCell()
    const accrued = Dictionary.empty(Dictionary.Keys.BigUint(300), Dictionary.Values.Uint(8))
    accrued.set(7n, 2)
    const accruedCell = beginCell().storeDictDirect(accrued).endCell()
    const stored = beginCell()
        .storeUint(1, 4)
        .storeUint(1, 16)
        .storeDict(null)
        .storeDict(null)
        .storeMaybeRef(rejectedCell)
        .storeMaybeRef(acceptedCell)
        .storeMaybeRef(accruedCell)
        .storeDict(null)
        .storeDict(null)
        .storeCoins(0)
        .storeCoins(0)
        .storeUint(0, 256)
        .storeUint(0, 32)
        .storeUint(0, 32)
        .endCell()

    const parsed = participationDictionaryValue.parse(stored.beginParse())
    assert.ok(parsed.rejected?.equals(rejectedCell))
    assert.ok(parsed.accepted?.equals(acceptedCell))
    assert.ok(parsed.accrued?.equals(accruedCell))
    const written = beginCell()
    participationDictionaryValue.serialize(parsed, written)
    assert.ok(written.endCell().equals(stored))
})
