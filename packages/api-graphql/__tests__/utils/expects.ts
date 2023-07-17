/**
 * Performs an `expect()` on a jest spy with some basic nested argument checks
 * based on the given mutation `opName` and `item`.
 *
 * @param spy The jest spy to check.
 * @param opName The name of the graphql operation. E.g., `createTodo`.
 * @param item The item we expect to have been in the `input`
 */
export function expectMutation(
	spy: jest.SpyInstance<any, any>,
	opName: string,
	item: Record<string, any>
) {
	expect(spy).toHaveBeenCalledWith(
		'https://localhost/graphql',
		expect.objectContaining({
			headers: expect.objectContaining({ 'X-Api-Key': 'FAKE-KEY' }),
			body: expect.objectContaining({
				query: expect.stringContaining(
					`${opName}(input: $input, condition: $condition)`
				),
				variables: expect.objectContaining({
					input: expect.objectContaining(item),
				}),
			}),
		})
	);
}

/**
 * Performs an `expect()` on a jest spy with some basic nested argument checks
 * based on the given get `opName` and `item`.
 *
 * @param spy The jest spy to check.
 * @param opName The name of the graphql operation. E.g., `getTodo`.
 * @param item The item we expect to have been in the `variables`
 */
export function expectGet(
	spy: jest.SpyInstance<any, any>,
	opName: string,
	item: Record<string, any>
) {
	expect(spy).toHaveBeenCalledWith(
		'https://localhost/graphql',
		expect.objectContaining({
			headers: expect.objectContaining({ 'X-Api-Key': 'FAKE-KEY' }),
			body: expect.objectContaining({
				query: expect.stringContaining(`${opName}(id: $id)`),
				variables: expect.objectContaining(item),
			}),
		})
	);
}

/**
 * Performs an `expect()` on a jest spy with some basic nested argument checks
 * based on the given list `opName` and `item`.
 *
 * @param spy The jest spy to check.
 * @param opName The name of the graphql operation. E.g., `listTodos`.
 * @param item The item we expect to have been in the `variables`
 */
export function expectList(
	spy: jest.SpyInstance<any, any>,
	opName: string,
	item: Record<string, any>
) {
	expect(spy).toHaveBeenCalledWith(
		'https://localhost/graphql',
		expect.objectContaining({
			headers: expect.objectContaining({ 'X-Api-Key': 'FAKE-KEY' }),
			body: expect.objectContaining({
				query: expect.stringContaining(
					`${opName}(filter: $filter, limit: $limit, nextToken: $nextToken)`
				),
				variables: expect.objectContaining(item),
			}),
		})
	);
}

/**
 * Performs an `expect()` on a jest spy with some basic nested argument checks
 * based on the given subscription `opName` and `item`.
 *
 * @param spy The jest spy to check.
 * @param opName The name of the graphql operation. E.g., `onCreateTodo`.
 * @param item The item we expect to have been in the `variables`
 */
export function expectSub(
	spy: jest.SpyInstance<any, any>,
	opName: string,
	item: Record<string, any>
) {
	expect(spy).toHaveBeenCalledWith(
		'',
		expect.objectContaining({
			authenticationType: 'API_KEY',
			apiKey: 'FAKE-KEY',
			appSyncGraphqlEndpoint: 'https://localhost/graphql',
			query: expect.stringContaining(
				`${opName}(filter: $filter, owner: $owner)`
			),
			variables: expect.objectContaining(item),
		}),
		undefined
	);
}

// /**
//  * A simple, typed pass-through function that confirms that the given `item`
//  * is of the given type `T`.
//  *
//  * This will succesfully cause a build to fail for non-T arguments when jest
//  * diagnostics are enabled.
//  *
//  * @param item The item to type-test.
//  */
// export function expectType<T>(item: T) {
// 	return true;
// }
