// @ts-ignore
import cbor, { CBOREncoder } from 'cbor'
import {
	CBOREncodableObject,
	CBOREncodablePrimitive,
	DSONCodable,
	DSONKeyValues,
	OutputMode,
} from './_types'
import { Result, err, ok } from 'neverthrow'
import { pipe } from '@radixdlt/util'
import { formatKeyValues, hasOutputMode } from './utils'

/**
 * Encodes some encodable object using CBOR. Overrides the default object encoding
 * to use stream encoding and lexicographical ordering of keys.
 *
 * @param data Object to encode
 */
export const encodeCbor = (
	data: CBOREncodableObject,
): Result<Buffer, Error> => {
	const encoder = new cbor.Encoder({
		highWaterMark: 90000,
		collapseBigIntegers: true,
	})

	// Overide default object encoder to use stream encoding and lexicographical ordering of keys
	encoder.addSemanticType(Object, (encoder: CBOREncoder, obj: any) => {
		const keys = Object.keys(obj)

		keys.sort()

		if (!encoder.push(Buffer.from([0b1011_1111]))) return false

		for (const key of keys) {
			if (isEmpty(obj[key])) {
				continue
			}

			if (!encoder.pushAny(key)) return false
			if (!encoder.pushAny(obj[key])) return false
		}

		if (!encoder.push(Buffer.from([0xff]))) return false

		return true
	})

	try {
		const encoded = encoder._encodeAll([data])
		return ok(encoded)
	} catch (e) {
		return err(new Error(`CBOR encoding failed: ${e}`))
	}
}

/**
 * Helper method used by objects that should be DSON encodable.
 *
 * @param serializer The serializer value.
 * @param encodingMethodOrKeyValues A function specifying the DSON encoding, OR
 * a list of DSON encodable objects.
 */

export const DSONEncoding = <Serializer extends string | undefined>(
	serializer: Serializer,
) => (
	encodingMethodOrKeyValues: Serializer extends string
		? DSONKeyValues
		: () => CBOREncodablePrimitive,
): DSONCodable => {
	const isFunction = (
		input: DSONKeyValues | (() => CBOREncodablePrimitive),
	): input is () => CBOREncodablePrimitive => typeof input === 'function'

	return isFunction(encodingMethodOrKeyValues)
		? DSONEncodableObject(encodingMethodOrKeyValues)
		: DSONEncodableMap({
				...defaultKeyValues(serializer as string),
				...encodingMethodOrKeyValues,
		  })
}

export const DSONPrimitive = (value: CBOREncodablePrimitive): DSONCodable => {
	if (isEmpty(value))
		throw new Error('DSON primitives cannot have an empty value.')

	return DSONEncoding(undefined)(() => value)
}

/**
 * DSON Encoding for a simple object. Such an object specifies an encoding function
 * for generating a CBOR encodable primitive.
 *
 * @param encodingFn A function that returns the primitive to be CBOR encoded.
 */
export const DSONEncodableObject = (
	encodingFn: () => CBOREncodablePrimitive,
): DSONCodable => {
	const encoding = () => ({
		encodeCBOR: (encoder: cbor.CBOREncoder) =>
			encoder.pushAny(encodingFn()),
	})

	return {
		encoding,
		toDSON: () => encodeCbor(encoding()),
	}
}

/**
 * DSON encoding for a complex type with several encodable objects.
 *
 * @param keyValues A list of DSON key value pairs.
 */
export const DSONEncodableMap = (keyValues: DSONKeyValues): DSONCodable =>
	pipe(formatKeyValues, DSONEncodableMapFormatted)(keyValues)

const DSONEncodableMapFormatted = (keyValues: {
	[key: string]:
		| DSONCodable
		| DSONCodable[]
		| { value: DSONCodable | DSONCodable[]; outputMode: OutputMode }
}) => {
	const encoding = (outputMode: OutputMode) => ({
		encodeCBOR: (encoder: cbor.CBOREncoder) => {
			encoder.push(Buffer.from([0b1011_1111]))

			Object.keys(keyValues)
				.filter((keyValue) =>
					allowsOutput(
						(keyValues[keyValue] as { outputMode: OutputMode })
							.outputMode ?? OutputMode.ALL,
						outputMode,
					),
				)
				.sort((keyValue1, keyValue2) =>
					keyValue1.localeCompare(keyValue2),
				)
				.map((keyValue) => {
					encoder.pushAny(keyValue)
					let value = keyValues[keyValue]

					if (hasOutputMode(value)) {
						value = value.value
					}

					Array.isArray(value)
						? encoder.pushAny(
								value.map((codable) =>
									codable.encoding(outputMode),
								),
						  )
						: encoder.pushAny(value.encoding(outputMode))
				})

			encoder.push(Buffer.from([0xff]))

			return true
		},
	})

	return {
		encoding,
		toDSON: (outputMode: OutputMode = OutputMode.ALL) =>
			encodeCbor(encoding(outputMode)),
	}
}

export const defaultKeyValues = (serializer: string): DSONKeyValues => ({
	serializer: DSONPrimitive(serializer),
})

const isEmpty = (val: any): boolean => {
	return (
		val === undefined ||
		val === null ||
		val.length === 0 ||
		(Object.keys(val).length === 0 && val.constructor === Object)
	)
}

const areDisjoint = (lhs: OutputMode, rhs: OutputMode): boolean => {
	return (lhs.valueOf() & rhs.valueOf()) === OutputMode.NONE.valueOf()
}

const intersects = (lhs: OutputMode, rhs: OutputMode): boolean => {
	return !areDisjoint(lhs, rhs)
}

const allowsOutput = (lhs: OutputMode, rhs: OutputMode): boolean =>
	intersects(lhs, rhs)
