import { addressFromBase58String } from '@radixdlt/crypto'
import { Denomination, zero } from '@radixdlt/primitives'
import { BurnTokensActionInput } from '../src/_types'
import { burnTokensAction } from '../src/burnTokensAction'
import { ResourceIdentifier } from '@radixdlt/atom/src/_index'
import { Amount } from '@radixdlt/primitives/src/amount'

describe('BurnTokensAction', () => {
	const alice = addressFromBase58String(
		'9S8khLHZa6FsyGo634xQo9QwLgSHGpXHHW764D5mPYBcrnfZV6RT',
	)._unsafeUnwrap()

	const rri = ResourceIdentifier.fromAddressAndName({
		address: alice,
		name: 'FOOBAR',
	})
	const amount = Amount.fromUnsafe(6, Denomination.Atto)._unsafeUnwrap()

	const input = <BurnTokensActionInput>{
		burner: alice,
		amount: amount,
		resourceIdentifier: rri,
	}

	it('should be possible to burn 0 tokens', () => {
		const burnAction = burnTokensAction({ ...input, amount: zero })
		expect(burnAction.amount.equals(zero)).toBe(true)
	})

	it(`should have a 'sender' equal to 'input.burner'.`, () => {
		const burnTokens = burnTokensAction({
			...input,
			burner: alice,
		})
		expect(burnTokens.sender.equals(alice)).toBe(true)
	})

	it(`should have an 'amount' equal to 'input.amount'.`, () => {
		const burnTokens = burnTokensAction(input)
		expect(burnTokens.amount.equals(amount)).toBe(true)
	})

	it('should generate a UUID if none is provided.', () => {
		const burnTokens = burnTokensAction(input)
		expect(burnTokens.uuid).toBeTruthy()
	})

	it('should be able to specify a UUID.', () => {
		const uuid = 'randomly generated string'
		const burnTokens = burnTokensAction({ ...input, uuid })
		expect(burnTokens.uuid).toBe(uuid)
	})
})
