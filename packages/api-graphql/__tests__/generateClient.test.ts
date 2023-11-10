import * as raw from '../src';
import { Amplify, AmplifyClassV6 } from '@aws-amplify/core';
import { generateClient } from '../src/internals';
import configFixture from './fixtures/modeled/amplifyconfiguration';
import { Schema } from './fixtures/modeled/schema';
import { expectSub } from './utils/expects';
import { Observable, from } from 'rxjs';

const serverManagedFields = {
	id: 'some-id',
	owner: 'wirejobviously',
	createdAt: new Date().toISOString(),
	updatedAt: new Date().toISOString(),
};

/**
 *
 * @param value Value to be returned. Will be `awaited`, and can
 * therefore be a simple JSON value or a `Promise`.
 * @returns
 */
function mockApiResponse(value: any) {
	return jest
		.spyOn((raw.GraphQLAPI as any)._api, 'post')
		.mockImplementation(async () => {
			const result = await value;
			return {
				body: {
					json: () => result,
				},
			};
		});
}

function makeAppSyncStreams() {
	const streams = {} as Partial<
		Record<
			'create' | 'update' | 'delete',
			{
				next: (message: any) => void;
			}
		>
	>;
	const spy = jest.fn(request => {
		const matchedType = (request.query as string).match(
			/on(Create|Update|Delete)/
		);
		if (matchedType) {
			return new Observable(subscriber => {
				streams[matchedType[1].toLowerCase()] = subscriber;
			});
		}
	});
	(raw.GraphQLAPI as any).appSyncRealTime = { subscribe: spy };
	return { streams, spy };
}

const USER_AGENT_DETAILS = {
	action: '1',
	category: 'api',
};

describe('generateClient', () => {
	test('raises clear error when API GraphQL isnt configured', () => {
		const getConfig = jest.fn().mockReturnValue({});
		const amplify = {
			getConfig,
		} as unknown as AmplifyClassV6;
		expect(() => generateClient({ amplify })).toThrow(
			'The API configuration is missing. This is likely due to Amplify.configure() not being called prior to generateClient()'
		);
	});

	test('can produce a client bound to an arbitrary amplify object for getConfig()', async () => {
		// TS lies: We don't care what `amplify` is or does. We want want to make sure
		// it shows up in the client in the right spot.

		const fetchAuthSession = jest.fn().mockReturnValue({});
		const getConfig = jest.fn().mockReturnValue({
			API: {
				GraphQL: {
					apiKey: 'apikey',
					customEndpoint: undefined,
					customEndpointRegion: undefined,
					defaultAuthMode: 'apiKey',
					endpoint: 'https://0.0.0.0/graphql',
					region: 'us-east-1',
				},
			},
		});

		const apiSpy = jest
			.spyOn((raw.GraphQLAPI as any)._api, 'post')
			.mockReturnValue({
				body: {
					json: () => ({
						data: {
							getWidget: {
								__typename: 'Widget',
								...serverManagedFields,
								someField: 'some value',
							},
						},
					}),
				},
			});

		const amplify = {
			Auth: {
				fetchAuthSession,
			},
			getConfig,
		} as unknown as AmplifyClassV6;

		const client = generateClient({ amplify });
		const result = (await client.graphql({
			query: `query Q {
				getWidget {
					__typename id owner createdAt updatedAt someField
				}
			}`,
		})) as any;

		// shouldn't fetch auth for apiKey auth
		expect(fetchAuthSession).not.toHaveBeenCalled();

		expect(getConfig).toHaveBeenCalled();
		expect(apiSpy).toHaveBeenCalled();
	});

	test('can produce a client bound to an arbitrary amplify object for fetchAuthSession()', async () => {
		// TS lies: We don't care what `amplify` is or does. We want want to make sure
		// it shows up in the client in the right spot.

		const fetchAuthSession = jest.fn().mockReturnValue({ credentials: {} });
		const getConfig = jest.fn().mockReturnValue({
			API: {
				GraphQL: {
					apiKey: undefined,
					customEndpoint: undefined,
					customEndpointRegion: undefined,
					defaultAuthMode: 'iam',
					endpoint: 'https://0.0.0.0/graphql',
					region: 'us-east-1',
				},
			},
		});

		const apiSpy = jest
			.spyOn((raw.GraphQLAPI as any)._api, 'post')
			.mockReturnValue({
				body: {
					json: () => ({
						data: {
							getWidget: {
								__typename: 'Widget',
								...serverManagedFields,
								someField: 'some value',
							},
						},
					}),
				},
			});

		const amplify = {
			Auth: {
				fetchAuthSession,
			},
			getConfig,
		} as unknown as AmplifyClassV6;

		const client = generateClient({ amplify });
		const result = await client.graphql({
			query: `query Q {
				getWidget {
					__typename id owner createdAt updatedAt someField
				}
			}`,
		});

		// should fetch auth for iam
		expect(fetchAuthSession).toHaveBeenCalled();

		expect(getConfig).toHaveBeenCalled();
		expect(apiSpy).toHaveBeenCalled();
	});

	describe('basic model operations', () => {
		beforeEach(() => {
			jest.clearAllMocks();
			Amplify.configure(configFixture as any);
		});

		test('can create()', async () => {
			const spy = mockApiResponse({
				data: {
					createTodo: {
						__typename: 'Todo',
						...serverManagedFields,
						name: 'some name',
						description: 'something something',
					},
				},
			});

			const client = generateClient<Schema>({ amplify: Amplify });
			const { data } = await client.models.Todo.create({
				name: 'some name',
				description: 'something something',
			});

			expect(spy).toHaveBeenCalledWith(
				expect.objectContaining({
					options: expect.objectContaining({
						headers: expect.objectContaining({
							'X-Api-Key': 'FAKE-KEY',
						}),
						body: {
							query: expect.stringContaining('createTodo(input: $input)'),
							variables: {
								input: {
									name: 'some name',
									description: 'something something',
								},
							},
						},
					}),
				})
			);

			expect(data).toEqual(
				expect.objectContaining({
					__typename: 'Todo',
					id: 'some-id',
					owner: 'wirejobviously',
					name: 'some name',
					description: 'something something',
				})
			);
		});

		test('can get()', async () => {
			const spy = mockApiResponse({
				data: {
					getTodo: {
						__typename: 'Todo',
						...serverManagedFields,
						name: 'some name',
						description: 'something something',
					},
				},
			});

			const client = generateClient<Schema>({ amplify: Amplify });
			const { data } = await client.models.Todo.get({ id: 'asdf' });

			expect(spy).toHaveBeenCalledWith(
				expect.objectContaining({
					options: expect.objectContaining({
						headers: expect.objectContaining({
							'X-Api-Key': 'FAKE-KEY',
						}),
						body: {
							query: expect.stringContaining('getTodo(id: $id)'),
							variables: {
								id: 'asdf',
							},
						},
					}),
				})
			);

			expect(data).toEqual(
				expect.objectContaining({
					__typename: 'Todo',
					id: 'some-id',
					owner: 'wirejobviously',
					name: 'some name',
					description: 'something something',
				})
			);
		});

		test('can list()', async () => {
			const spy = mockApiResponse({
				data: {
					listTodos: {
						items: [
							{
								__typename: 'Todo',
								...serverManagedFields,
								name: 'some name',
								description: 'something something',
							},
						],
					},
				},
			});

			const client = generateClient<Schema>({ amplify: Amplify });
			const { data } = await client.models.Todo.list({
				filter: { name: { contains: 'name' } },
			});

			expect(spy).toHaveBeenCalledWith(
				expect.objectContaining({
					options: expect.objectContaining({
						headers: expect.objectContaining({
							'X-Api-Key': 'FAKE-KEY',
						}),
						body: {
							query: expect.stringContaining(
								'listTodos(filter: $filter, limit: $limit, nextToken: $nextToken)'
							),
							variables: {
								filter: {
									name: {
										contains: 'name',
									},
								},
							},
						},
					}),
				})
			);

			expect(spy).toHaveBeenCalledWith(
				expect.objectContaining({
					options: expect.objectContaining({
						body: expect.objectContaining({
							// match nextToken in selection set
							query: expect.stringMatching(/^\s*nextToken\s*$/m),
						}),
					}),
				})
			);

			expect(data.length).toBe(1);
			expect(data[0]).toEqual(
				expect.objectContaining({
					__typename: 'Todo',
					id: 'some-id',
					owner: 'wirejobviously',
					name: 'some name',
					description: 'something something',
				})
			);
		});

		test('can list() with nextToken', async () => {
			const spy = mockApiResponse({
				data: {
					listTodos: {
						items: [
							{
								__typename: 'Todo',
								...serverManagedFields,
								name: 'some name',
								description: 'something something',
							},
						],
					},
				},
			});

			const client = generateClient<Schema>({ amplify: Amplify });
			const { data } = await client.models.Todo.list({
				filter: { name: { contains: 'name' } },
				nextToken: 'some-token',
			});

			expect(spy).toHaveBeenCalledWith(
				expect.objectContaining({
					options: expect.objectContaining({
						headers: expect.objectContaining({
							'X-Api-Key': 'FAKE-KEY',
						}),
						body: {
							query: expect.stringContaining(
								'listTodos(filter: $filter, limit: $limit, nextToken: $nextToken)'
							),
							variables: {
								filter: {
									name: {
										contains: 'name',
									},
								},
								nextToken: 'some-token',
							},
						},
					}),
				})
			);

			expect(spy).toHaveBeenCalledWith(
				expect.objectContaining({
					options: expect.objectContaining({
						body: expect.objectContaining({
							// match nextToken in selection set
							query: expect.stringMatching(/^\s*nextToken\s*$/m),
						}),
					}),
				})
			);
		});

		test('can list() with limit', async () => {
			const spy = mockApiResponse({
				data: {
					listTodos: {
						items: [
							{
								__typename: 'Todo',
								...serverManagedFields,
								name: 'some name',
								description: 'something something',
							},
						],
					},
				},
			});

			const client = generateClient<Schema>({ amplify: Amplify });
			const { data } = await client.models.Todo.list({
				filter: { name: { contains: 'name' } },
				limit: 5,
			});

			expect(spy).toHaveBeenCalledWith(
				expect.objectContaining({
					options: expect.objectContaining({
						headers: expect.objectContaining({
							'X-Api-Key': 'FAKE-KEY',
						}),
						body: {
							query: expect.stringContaining(
								'listTodos(filter: $filter, limit: $limit, nextToken: $nextToken)'
							),
							variables: {
								filter: {
									name: {
										contains: 'name',
									},
								},
								limit: 5,
							},
						},
					}),
				})
			);

			expect(spy).toHaveBeenCalledWith(
				expect.objectContaining({
					options: expect.objectContaining({
						body: expect.objectContaining({
							// match nextToken in selection set
							query: expect.stringMatching(/^\s*nextToken\s*$/m),
						}),
					}),
				})
			);
		});

		test('can update()', async () => {
			const spy = mockApiResponse({
				data: {
					updateTodo: {
						__typename: 'Todo',
						...serverManagedFields,
						name: 'some other name',
						description: 'something something',
					},
				},
			});

			const client = generateClient<Schema>({ amplify: Amplify });
			const { data } = await client.models.Todo.update({
				id: 'some-id',
				name: 'some other name',
			});

			expect(spy).toHaveBeenCalledWith(
				expect.objectContaining({
					options: expect.objectContaining({
						headers: expect.objectContaining({
							'X-Api-Key': 'FAKE-KEY',
						}),
						body: {
							query: expect.stringContaining('updateTodo(input: $input)'),
							variables: {
								input: {
									id: 'some-id',
									name: 'some other name',
								},
							},
						},
					}),
				})
			);

			expect(data).toEqual(
				expect.objectContaining({
					__typename: 'Todo',
					id: 'some-id',
					owner: 'wirejobviously',
					name: 'some other name',
					description: 'something something',
				})
			);
		});

		test('can delete()', async () => {
			const spy = mockApiResponse({
				data: {
					deleteTodo: {
						__typename: 'Todo',
						...serverManagedFields,
						name: 'some name',
						description: 'something something',
					},
				},
			});

			const client = generateClient<Schema>({ amplify: Amplify });
			const { data } = await client.models.Todo.delete({
				id: 'some-id',
			});

			expect(spy).toHaveBeenCalledWith(
				expect.objectContaining({
					options: expect.objectContaining({
						headers: expect.objectContaining({
							'X-Api-Key': 'FAKE-KEY',
						}),
						body: {
							query: expect.stringContaining('deleteTodo(input: $input)'),
							variables: {
								input: {
									id: 'some-id',
								},
							},
						},
					}),
				})
			);

			expect(data).toEqual(
				expect.objectContaining({
					__typename: 'Todo',
					id: 'some-id',
					owner: 'wirejobviously',
					name: 'some name',
					description: 'something something',
				})
			);
		});

		test('can subscribe to onCreate()', done => {
			const noteToSend = {
				__typename: 'Note',
				...serverManagedFields,
				body: 'a very good note',
			};

			const graphqlMessage = {
				data: {
					onCreateNote: noteToSend,
				},
			};

			const graphqlVariables = {
				filter: {
					body: { contains: 'good note' },
				},
			};

			const client = generateClient<Schema>({ amplify: Amplify });

			const spy = jest.fn(() => from([graphqlMessage]));
			(raw.GraphQLAPI as any).appSyncRealTime = { subscribe: spy };

			client.models.Note.onCreate({
				filter: graphqlVariables.filter,
			}).subscribe({
				next(value) {
					expectSub(spy, 'onCreateNote', graphqlVariables);
					expect(value).toEqual(expect.objectContaining(noteToSend));
					done();
				},
				error(error) {
					expect(error).toBeUndefined();
					done('bad news!');
				},
			});
		});

		test('can subscribe to onUpdate()', done => {
			const noteToSend = {
				__typename: 'Note',
				...serverManagedFields,
				body: 'a very good note',
			};

			const graphqlMessage = {
				data: {
					onUpdateNote: noteToSend,
				},
			};

			const graphqlVariables = {
				filter: {
					body: { contains: 'good note' },
				},
			};

			const client = generateClient<Schema>({ amplify: Amplify });

			const spy = jest.fn(() => from([graphqlMessage]));
			(raw.GraphQLAPI as any).appSyncRealTime = { subscribe: spy };

			client.models.Note.onUpdate({
				filter: graphqlVariables.filter,
			}).subscribe({
				next(value) {
					expectSub(spy, 'onUpdateNote', graphqlVariables);
					expect(value).toEqual(expect.objectContaining(noteToSend));
					done();
				},
				error(error) {
					expect(error).toBeUndefined();
					done('bad news!');
				},
			});
		});

		test('can subscribe to onDelete()', done => {
			const noteToSend = {
				__typename: 'Note',
				...serverManagedFields,
				body: 'a very good note',
			};

			const graphqlMessage = {
				data: {
					onDeleteNote: noteToSend,
				},
			};

			const graphqlVariables = {
				filter: {
					body: { contains: 'good note' },
				},
			};

			const client = generateClient<Schema>({ amplify: Amplify });

			const spy = jest.fn(() => from([graphqlMessage]));
			(raw.GraphQLAPI as any).appSyncRealTime = { subscribe: spy };

			client.models.Note.onDelete({
				filter: graphqlVariables.filter,
			}).subscribe({
				next(value) {
					expectSub(spy, 'onDeleteNote', graphqlVariables);
					expect(value).toEqual(expect.objectContaining(noteToSend));
					done();
				},
				error(error) {
					expect(error).toBeUndefined();
					done('bad news!');
				},
			});
		});

		test('can lazy load @hasMany', async () => {
			mockApiResponse({
				data: {
					getTodo: {
						__typename: 'Todo',
						...serverManagedFields,
						id: 'todo-id',
						name: 'some name',
						description: 'something something',
					},
				},
			});

			const client = generateClient<Schema>({ amplify: Amplify });
			const { data } = await client.models.Todo.get({ id: 'todo-id' });

			const getChildNotesSpy = mockApiResponse({
				data: {
					listNotes: {
						items: [
							{
								__typename: 'Note',
								...serverManagedFields,
								id: 'note-id',
								body: 'some body',
							},
						],
					},
				},
			});

			const { data: notes } = await data.notes();

			expect(getChildNotesSpy).toHaveBeenCalledWith(
				expect.objectContaining({
					options: expect.objectContaining({
						headers: expect.objectContaining({
							'X-Api-Key': 'FAKE-KEY',
						}),
						body: {
							query: expect.stringContaining(
								'listNotes(filter: $filter, limit: $limit, nextToken: $nextToken)'
							),
							variables: {
								filter: {
									and: [{ todoNotesId: { eq: 'todo-id' } }],
								},
							},
						},
					}),
				})
			);

			expect(notes!.length).toBe(1);
			expect(notes![0]).toEqual(
				expect.objectContaining({
					__typename: 'Note',
					id: 'note-id',
					owner: 'wirejobviously',
					body: 'some body',
				})
			);
		});

		test('can lazy load @hasMany with nextToken', async () => {
			mockApiResponse({
				data: {
					getTodo: {
						__typename: 'Todo',
						...serverManagedFields,
						id: 'todo-id',
						name: 'some name',
						description: 'something something',
					},
				},
			});

			const client = generateClient<Schema>({ amplify: Amplify });
			const { data } = await client.models.Todo.get({ id: 'todo-id' });

			const getChildNotesSpy = mockApiResponse({
				data: {
					listNotes: {
						items: [
							{
								__typename: 'Note',
								...serverManagedFields,
								id: 'note-id',
								body: 'some body',
							},
						],
					},
				},
			});

			const { data: notes } = await data.notes({ nextToken: 'some-token' });

			expect(getChildNotesSpy).toHaveBeenCalledWith(
				expect.objectContaining({
					options: expect.objectContaining({
						headers: expect.objectContaining({
							'X-Api-Key': 'FAKE-KEY',
						}),
						body: {
							query: expect.stringContaining(
								'listNotes(filter: $filter, limit: $limit, nextToken: $nextToken)'
							),
							variables: {
								filter: {
									and: [{ todoNotesId: { eq: 'todo-id' } }],
								},
								nextToken: 'some-token',
							},
						},
					}),
				})
			);

			expect(notes!.length).toBe(1);
			expect(notes![0]).toEqual(
				expect.objectContaining({
					__typename: 'Note',
					id: 'note-id',
					owner: 'wirejobviously',
					body: 'some body',
				})
			);
		});

		test('can lazy load @hasMany with limit', async () => {
			mockApiResponse({
				data: {
					getTodo: {
						__typename: 'Todo',
						...serverManagedFields,
						id: 'todo-id',
						name: 'some name',
						description: 'something something',
					},
				},
			});

			const client = generateClient<Schema>({ amplify: Amplify });
			const { data } = await client.models.Todo.get({ id: 'todo-id' });

			const getChildNotesSpy = mockApiResponse({
				data: {
					listNotes: {
						items: [
							{
								__typename: 'Note',
								...serverManagedFields,
								id: 'note-id',
								body: 'some body',
							},
						],
					},
				},
			});

			const { data: notes } = await data.notes({ limit: 5 });

			expect(getChildNotesSpy).toHaveBeenCalledWith(
				expect.objectContaining({
					options: expect.objectContaining({
						headers: expect.objectContaining({
							'X-Api-Key': 'FAKE-KEY',
						}),
						body: {
							query: expect.stringContaining(
								'listNotes(filter: $filter, limit: $limit, nextToken: $nextToken)'
							),
							variables: {
								filter: {
									and: [{ todoNotesId: { eq: 'todo-id' } }],
								},
								limit: 5,
							},
						},
					}),
				})
			);

			expect(notes!.length).toBe(1);
			expect(notes![0]).toEqual(
				expect.objectContaining({
					__typename: 'Note',
					id: 'note-id',
					owner: 'wirejobviously',
					body: 'some body',
				})
			);
		});

		test('can lazy load @belongsTo', async () => {
			mockApiResponse({
				data: {
					getNote: {
						__typename: 'Note',
						...serverManagedFields,
						id: 'note-id',
						body: 'some body',
						todoNotesId: 'todo-id',
					},
				},
			});

			const client = generateClient<Schema>({ amplify: Amplify });
			const { data } = await client.models.Note.get({ id: 'note-id' });

			const getChildNotesSpy = mockApiResponse({
				data: {
					getTodo: {
						__typename: 'Todo',
						...serverManagedFields,
						id: 'todo-id',
						name: 'some name',
						description: 'something something',
					},
				},
			});

			const { data: todo } = await data.todo();

			expect(getChildNotesSpy).toHaveBeenCalledWith(
				expect.objectContaining({
					options: expect.objectContaining({
						headers: expect.objectContaining({
							'X-Api-Key': 'FAKE-KEY',
						}),
						body: {
							query: expect.stringContaining('getTodo(id: $id)'),
							variables: {
								id: 'todo-id',
							},
						},
					}),
				})
			);

			expect(todo).toEqual(
				expect.objectContaining({
					__typename: 'Todo',
					id: 'todo-id',
					name: 'some name',
					description: 'something something',
				})
			);
		});

		test('can lazy load @hasOne', async () => {
			mockApiResponse({
				data: {
					getTodo: {
						__typename: 'Todo',
						...serverManagedFields,
						id: 'todo-id',
						body: 'some body',
						todoMetaId: 'meta-id',
					},
				},
			});

			const client = generateClient<Schema>({ amplify: Amplify });
			const { data } = await client.models.Todo.get({ id: 'todo-id' });

			const getChildMetaSpy = mockApiResponse({
				data: {
					getTodoMetadata: {
						__typename: 'TodoMetadata',
						...serverManagedFields,
						id: 'meta-id',
						data: '{"field":"value"}',
					},
				},
			});

			const { data: todo } = await data.meta();

			expect(getChildMetaSpy).toHaveBeenCalledWith(
				expect.objectContaining({
					options: expect.objectContaining({
						headers: expect.objectContaining({
							'X-Api-Key': 'FAKE-KEY',
						}),
						body: {
							query: expect.stringContaining('getTodoMetadata(id: $id)'),
							variables: {
								id: 'meta-id',
							},
						},
					}),
				})
			);

			expect(todo).toEqual(
				expect.objectContaining({
					__typename: 'TodoMetadata',
					id: 'meta-id',
					data: '{"field":"value"}',
				})
			);
		});
	});

	describe('basic model operations - authMode: CuP override at the time of operation', () => {
		beforeEach(() => {
			jest.clearAllMocks();
			Amplify.configure(configFixture as any);

			jest
				.spyOn(Amplify.Auth, 'fetchAuthSession')
				.mockImplementation(async () => {
					return {
						tokens: {
							accessToken: {
								toString: () => 'test',
							},
						},
						credentials: {
							accessKeyId: 'test',
							secretAccessKey: 'test',
						},
					} as any;
				});
		});

		test('can create()', async () => {
			const spy = mockApiResponse({
				data: {
					createTodo: {
						__typename: 'Todo',
						...serverManagedFields,
						name: 'some name',
						description: 'something something',
					},
				},
			});

			const client = generateClient<Schema>({ amplify: Amplify });
			await client.models.Todo.create(
				{
					name: 'some name',
					description: 'something something',
				},
				{
					authMode: 'userPool',
				}
			);

			expect(spy).toHaveBeenCalledWith(
				expect.objectContaining({
					options: expect.objectContaining({
						headers: expect.objectContaining({
							Authorization: 'test',
						}),
						body: {
							query: expect.stringContaining('createTodo(input: $input)'),
							variables: {
								input: {
									name: 'some name',
									description: 'something something',
								},
							},
						},
					}),
				})
			);
		});

		test('can get()', async () => {
			const spy = mockApiResponse({
				data: {
					getTodo: {
						__typename: 'Todo',
						...serverManagedFields,
						name: 'some name',
						description: 'something something',
					},
				},
			});

			const client = generateClient<Schema>({ amplify: Amplify });
			await client.models.Todo.get({ id: 'asdf' }, { authMode: 'userPool' });

			expect(spy).toHaveBeenCalledWith(
				expect.objectContaining({
					options: expect.objectContaining({
						headers: expect.objectContaining({
							Authorization: 'test',
						}),
						body: {
							query: expect.stringContaining('getTodo(id: $id)'),
							variables: {
								id: 'asdf',
							},
						},
					}),
				})
			);
		});

		test('can list()', async () => {
			const spy = mockApiResponse({
				data: {
					listTodos: {
						items: [
							{
								__typename: 'Todo',
								...serverManagedFields,
								name: 'some name',
								description: 'something something',
							},
						],
					},
				},
			});

			const client = generateClient<Schema>({ amplify: Amplify });
			await client.models.Todo.list({
				filter: { name: { contains: 'name' } },
				authMode: 'userPool',
			});

			expect(spy).toHaveBeenCalledWith(
				expect.objectContaining({
					options: expect.objectContaining({
						headers: expect.objectContaining({
							Authorization: 'test',
						}),
						body: {
							query: expect.stringContaining(
								'listTodos(filter: $filter, limit: $limit, nextToken: $nextToken)'
							),
							variables: {
								filter: {
									name: {
										contains: 'name',
									},
								},
							},
						},
					}),
				})
			);
		});

		test('can update()', async () => {
			const spy = mockApiResponse({
				data: {
					updateTodo: {
						__typename: 'Todo',
						...serverManagedFields,
						name: 'some other name',
						description: 'something something',
					},
				},
			});

			const client = generateClient<Schema>({ amplify: Amplify });
			await client.models.Todo.update(
				{
					id: 'some-id',
					name: 'some other name',
				},
				{ authMode: 'userPool' }
			);

			expect(spy).toHaveBeenCalledWith(
				expect.objectContaining({
					options: expect.objectContaining({
						headers: expect.objectContaining({
							Authorization: 'test',
						}),
						body: {
							query: expect.stringContaining('updateTodo(input: $input)'),
							variables: {
								input: {
									id: 'some-id',
									name: 'some other name',
								},
							},
						},
					}),
				})
			);
		});

		test('can delete()', async () => {
			const spy = mockApiResponse({
				data: {
					deleteTodo: {
						__typename: 'Todo',
						...serverManagedFields,
						name: 'some name',
						description: 'something something',
					},
				},
			});

			const client = generateClient<Schema>({ amplify: Amplify });
			await client.models.Todo.delete(
				{
					id: 'some-id',
				},
				{ authMode: 'userPool' }
			);

			expect(spy).toHaveBeenCalledWith(
				expect.objectContaining({
					options: expect.objectContaining({
						headers: expect.objectContaining({
							Authorization: 'test',
						}),
						body: {
							query: expect.stringContaining('deleteTodo(input: $input)'),
							variables: {
								input: {
									id: 'some-id',
								},
							},
						},
					}),
				})
			);
		});

		test('can subscribe to onCreate()', done => {
			const noteToSend = {
				__typename: 'Note',
				...serverManagedFields,
				body: 'a very good note',
			};

			const graphqlMessage = {
				data: {
					onCreateNote: noteToSend,
				},
			};

			const client = generateClient<Schema>({ amplify: Amplify });

			const spy = jest.fn(() => from([graphqlMessage]));
			(raw.GraphQLAPI as any).appSyncRealTime = { subscribe: spy };

			client.models.Note.onCreate({
				authMode: 'userPool',
			}).subscribe({
				next(value) {
					expect(spy).toHaveBeenCalledWith(
						expect.objectContaining({
							authenticationType: 'userPool',
						}),
						USER_AGENT_DETAILS
					);
					done();
				},
				error(error) {
					expect(error).toBeUndefined();
					done('bad news!');
				},
			});
		});

		test('can subscribe to onUpdate()', done => {
			const noteToSend = {
				__typename: 'Note',
				...serverManagedFields,
				body: 'a very good note',
			};

			const graphqlMessage = {
				data: {
					onUpdateNote: noteToSend,
				},
			};

			const client = generateClient<Schema>({ amplify: Amplify });

			const spy = jest.fn(() => from([graphqlMessage]));
			(raw.GraphQLAPI as any).appSyncRealTime = { subscribe: spy };

			client.models.Note.onUpdate({
				authMode: 'userPool',
			}).subscribe({
				next(value) {
					expect(spy).toHaveBeenCalledWith(
						expect.objectContaining({
							authenticationType: 'userPool',
						}),
						USER_AGENT_DETAILS
					);
					done();
				},
				error(error) {
					expect(error).toBeUndefined();
					done('bad news!');
				},
			});
		});

		test('can subscribe to onDelete()', done => {
			const noteToSend = {
				__typename: 'Note',
				...serverManagedFields,
				body: 'a very good note',
			};

			const graphqlMessage = {
				data: {
					onDeleteNote: noteToSend,
				},
			};

			const client = generateClient<Schema>({ amplify: Amplify });

			const spy = jest.fn(() => from([graphqlMessage]));
			(raw.GraphQLAPI as any).appSyncRealTime = { subscribe: spy };

			client.models.Note.onDelete({
				authMode: 'userPool',
			}).subscribe({
				next(value) {
					expect(spy).toHaveBeenCalledWith(
						expect.objectContaining({
							authenticationType: 'userPool',
						}),
						USER_AGENT_DETAILS
					);
					done();
				},
				error(error) {
					expect(error).toBeUndefined();
					done('bad news!');
				},
			});
		});

		describe('can lazy load with inherited authMode', () => {
			test('can lazy load @hasMany', async () => {
				mockApiResponse({
					data: {
						getTodo: {
							__typename: 'Todo',
							...serverManagedFields,
							id: 'todo-id',
							name: 'some name',
							description: 'something something',
						},
					},
				});

				const client = generateClient<Schema>({ amplify: Amplify });
				const { data } = await client.models.Todo.get(
					{ id: 'todo-id' },
					{ authMode: 'userPool' }
				);

				const getChildNotesSpy = mockApiResponse({
					data: {
						listNotes: {
							items: [
								{
									__typename: 'Note',
									...serverManagedFields,
									id: 'note-id',
									body: 'some body',
								},
							],
						},
					},
				});

				await data.notes();

				expect(getChildNotesSpy).toHaveBeenCalledWith(
					expect.objectContaining({
						options: expect.objectContaining({
							headers: expect.objectContaining({
								Authorization: 'test',
							}),
							body: {
								query: expect.stringContaining(
									'listNotes(filter: $filter, limit: $limit, nextToken: $nextToken)'
								),
								variables: {
									filter: {
										and: [{ todoNotesId: { eq: 'todo-id' } }],
									},
								},
							},
						}),
					})
				);
			});

			test('can lazy load @belongsTo', async () => {
				mockApiResponse({
					data: {
						getNote: {
							__typename: 'Note',
							...serverManagedFields,
							id: 'note-id',
							body: 'some body',
							todoNotesId: 'todo-id',
						},
					},
				});

				const client = generateClient<Schema>({ amplify: Amplify });
				const { data } = await client.models.Note.get(
					{ id: 'note-id' },
					{
						authMode: 'userPool',
					}
				);

				const getChildNotesSpy = mockApiResponse({
					data: {
						getTodo: {
							__typename: 'Todo',
							...serverManagedFields,
							id: 'todo-id',
							name: 'some name',
							description: 'something something',
						},
					},
				});

				await data.todo();

				expect(getChildNotesSpy).toHaveBeenCalledWith(
					expect.objectContaining({
						options: expect.objectContaining({
							headers: expect.objectContaining({
								Authorization: 'test',
							}),
							body: {
								query: expect.stringContaining('getTodo(id: $id)'),
								variables: {
									id: 'todo-id',
								},
							},
						}),
					})
				);
			});

			test('can lazy load @hasOne', async () => {
				mockApiResponse({
					data: {
						getTodo: {
							__typename: 'Todo',
							...serverManagedFields,
							id: 'todo-id',
							body: 'some body',
							todoMetaId: 'meta-id',
						},
					},
				});

				const client = generateClient<Schema>({ amplify: Amplify });
				const { data } = await client.models.Todo.get(
					{ id: 'todo-id' },
					{
						authMode: 'userPool',
					}
				);

				const getChildMetaSpy = mockApiResponse({
					data: {
						getTodoMetadata: {
							__typename: 'TodoMetadata',
							...serverManagedFields,
							id: 'meta-id',
							data: '{"field":"value"}',
						},
					},
				});

				await data.meta();

				expect(getChildMetaSpy).toHaveBeenCalledWith(
					expect.objectContaining({
						options: expect.objectContaining({
							headers: expect.objectContaining({
								Authorization: 'test',
							}),
							body: {
								query: expect.stringContaining('getTodoMetadata(id: $id)'),
								variables: {
									id: 'meta-id',
								},
							},
						}),
					})
				);
			});
		});

		describe('can lazy load with overridden authMode', () => {
			test('can lazy load @hasMany', async () => {
				mockApiResponse({
					data: {
						getTodo: {
							__typename: 'Todo',
							...serverManagedFields,
							id: 'todo-id',
							name: 'some name',
							description: 'something something',
						},
					},
				});

				const client = generateClient<Schema>({ amplify: Amplify });
				const { data } = await client.models.Todo.get(
					{ id: 'todo-id' },
					{ authMode: 'userPool' }
				);

				const getChildNotesSpy = mockApiResponse({
					data: {
						listNotes: {
							items: [
								{
									__typename: 'Note',
									...serverManagedFields,
									id: 'note-id',
									body: 'some body',
								},
							],
						},
					},
				});

				await data.notes({ authMode: 'apiKey' });

				expect(getChildNotesSpy).toHaveBeenCalledWith(
					expect.objectContaining({
						options: expect.objectContaining({
							headers: expect.objectContaining({
								'X-Api-Key': 'FAKE-KEY',
							}),
							body: {
								query: expect.stringContaining(
									'listNotes(filter: $filter, limit: $limit, nextToken: $nextToken)'
								),
								variables: {
									filter: {
										and: [{ todoNotesId: { eq: 'todo-id' } }],
									},
								},
							},
						}),
					})
				);
			});

			test('can lazy load @belongsTo', async () => {
				mockApiResponse({
					data: {
						getNote: {
							__typename: 'Note',
							...serverManagedFields,
							id: 'note-id',
							body: 'some body',
							todoNotesId: 'todo-id',
						},
					},
				});

				const client = generateClient<Schema>({ amplify: Amplify });
				const { data } = await client.models.Note.get(
					{ id: 'note-id' },
					{
						authMode: 'userPool',
					}
				);

				const getChildNotesSpy = mockApiResponse({
					data: {
						getTodo: {
							__typename: 'Todo',
							...serverManagedFields,
							id: 'todo-id',
							name: 'some name',
							description: 'something something',
						},
					},
				});

				await data.todo({ authMode: 'apiKey' });

				expect(getChildNotesSpy).toHaveBeenCalledWith(
					expect.objectContaining({
						options: expect.objectContaining({
							headers: expect.objectContaining({
								'X-Api-Key': 'FAKE-KEY',
							}),
							body: {
								query: expect.stringContaining('getTodo(id: $id)'),
								variables: {
									id: 'todo-id',
								},
							},
						}),
					})
				);
			});

			test('can lazy load @hasOne', async () => {
				mockApiResponse({
					data: {
						getTodo: {
							__typename: 'Todo',
							...serverManagedFields,
							id: 'todo-id',
							body: 'some body',
							todoMetaId: 'meta-id',
						},
					},
				});

				const client = generateClient<Schema>({ amplify: Amplify });
				const { data } = await client.models.Todo.get(
					{ id: 'todo-id' },
					{
						authMode: 'userPool',
					}
				);

				const getChildMetaSpy = mockApiResponse({
					data: {
						getTodoMetadata: {
							__typename: 'TodoMetadata',
							...serverManagedFields,
							id: 'meta-id',
							data: '{"field":"value"}',
						},
					},
				});

				await data.meta({ authMode: 'apiKey' });

				expect(getChildMetaSpy).toHaveBeenCalledWith(
					expect.objectContaining({
						options: expect.objectContaining({
							headers: expect.objectContaining({
								'X-Api-Key': 'FAKE-KEY',
							}),
							body: {
								query: expect.stringContaining('getTodoMetadata(id: $id)'),
								variables: {
									id: 'meta-id',
								},
							},
						}),
					})
				);
			});
		});
	});

	describe('basic model operations - authMode: lambda override at the time of operation', () => {
		beforeEach(() => {
			jest.clearAllMocks();
			Amplify.configure(configFixture as any);

			jest
				.spyOn(Amplify.Auth, 'fetchAuthSession')
				.mockImplementation(async () => {
					return {
						tokens: {
							accessToken: {
								toString: () => 'test',
							},
						},
						credentials: {
							accessKeyId: 'test',
							secretAccessKey: 'test',
						},
					} as any;
				});
		});

		test('can create()', async () => {
			const spy = mockApiResponse({
				data: {
					createTodo: {
						__typename: 'Todo',
						...serverManagedFields,
						name: 'some name',
						description: 'something something',
					},
				},
			});

			const client = generateClient<Schema>({ amplify: Amplify });
			await client.models.Todo.create(
				{
					name: 'some name',
					description: 'something something',
				},
				{
					authMode: 'lambda',
					authToken: 'some-token',
				}
			);

			expect(spy).toHaveBeenCalledWith(
				expect.objectContaining({
					options: expect.objectContaining({
						headers: expect.objectContaining({
							Authorization: 'some-token',
						}),
						body: {
							query: expect.stringContaining('createTodo(input: $input)'),
							variables: {
								input: {
									name: 'some name',
									description: 'something something',
								},
							},
						},
					}),
				})
			);
		});

		test('can get()', async () => {
			const spy = mockApiResponse({
				data: {
					getTodo: {
						__typename: 'Todo',
						...serverManagedFields,
						name: 'some name',
						description: 'something something',
					},
				},
			});

			const client = generateClient<Schema>({ amplify: Amplify });
			await client.models.Todo.get(
				{ id: 'asdf' },
				{ authMode: 'lambda', authToken: 'some-token' }
			);

			expect(spy).toHaveBeenCalledWith(
				expect.objectContaining({
					options: expect.objectContaining({
						headers: expect.objectContaining({
							Authorization: 'some-token',
						}),
						body: {
							query: expect.stringContaining('getTodo(id: $id)'),
							variables: {
								id: 'asdf',
							},
						},
					}),
				})
			);
		});

		test('can list()', async () => {
			const spy = mockApiResponse({
				data: {
					listTodos: {
						items: [
							{
								__typename: 'Todo',
								...serverManagedFields,
								name: 'some name',
								description: 'something something',
							},
						],
					},
				},
			});

			const client = generateClient<Schema>({ amplify: Amplify });
			await client.models.Todo.list({
				filter: { name: { contains: 'name' } },
				authMode: 'lambda',
				authToken: 'some-token',
			});

			expect(spy).toHaveBeenCalledWith(
				expect.objectContaining({
					options: expect.objectContaining({
						headers: expect.objectContaining({
							Authorization: 'some-token',
						}),
						body: {
							query: expect.stringContaining(
								'listTodos(filter: $filter, limit: $limit, nextToken: $nextToken)'
							),
							variables: {
								filter: {
									name: {
										contains: 'name',
									},
								},
							},
						},
					}),
				})
			);
		});

		test('can update()', async () => {
			const spy = mockApiResponse({
				data: {
					updateTodo: {
						__typename: 'Todo',
						...serverManagedFields,
						name: 'some other name',
						description: 'something something',
					},
				},
			});

			const client = generateClient<Schema>({ amplify: Amplify });
			await client.models.Todo.update(
				{
					id: 'some-id',
					name: 'some other name',
				},
				{ authMode: 'lambda', authToken: 'some-token' }
			);

			expect(spy).toHaveBeenCalledWith(
				expect.objectContaining({
					options: expect.objectContaining({
						headers: expect.objectContaining({
							Authorization: 'some-token',
						}),
						body: {
							query: expect.stringContaining('updateTodo(input: $input)'),
							variables: {
								input: {
									id: 'some-id',
									name: 'some other name',
								},
							},
						},
					}),
				})
			);
		});

		test('can delete()', async () => {
			const spy = mockApiResponse({
				data: {
					deleteTodo: {
						__typename: 'Todo',
						...serverManagedFields,
						name: 'some name',
						description: 'something something',
					},
				},
			});

			const client = generateClient<Schema>({ amplify: Amplify });
			await client.models.Todo.delete(
				{
					id: 'some-id',
				},
				{ authMode: 'lambda', authToken: 'some-token' }
			);

			expect(spy).toHaveBeenCalledWith(
				expect.objectContaining({
					options: expect.objectContaining({
						headers: expect.objectContaining({
							Authorization: 'some-token',
						}),
						body: {
							query: expect.stringContaining('deleteTodo(input: $input)'),
							variables: {
								input: {
									id: 'some-id',
								},
							},
						},
					}),
				})
			);
		});

		test('can subscribe to onCreate()', done => {
			const noteToSend = {
				__typename: 'Note',
				...serverManagedFields,
				body: 'a very good note',
			};

			const graphqlMessage = {
				data: {
					onCreateNote: noteToSend,
				},
			};

			const client = generateClient<Schema>({ amplify: Amplify });

			const spy = jest.fn(() => from([graphqlMessage]));
			(raw.GraphQLAPI as any).appSyncRealTime = { subscribe: spy };

			client.models.Note.onCreate({
				authMode: 'lambda',
				authToken: 'some-token',
			}).subscribe({
				next(value) {
					expect(spy).toHaveBeenCalledWith(
						expect.objectContaining({
							authenticationType: 'lambda',
						}),
						USER_AGENT_DETAILS
					);
					done();
				},
				error(error) {
					expect(error).toBeUndefined();
					done('bad news!');
				},
			});
		});

		test('can subscribe to onUpdate()', done => {
			const noteToSend = {
				__typename: 'Note',
				...serverManagedFields,
				body: 'a very good note',
			};

			const graphqlMessage = {
				data: {
					onUpdateNote: noteToSend,
				},
			};

			const client = generateClient<Schema>({ amplify: Amplify });

			const spy = jest.fn(() => from([graphqlMessage]));
			(raw.GraphQLAPI as any).appSyncRealTime = { subscribe: spy };

			client.models.Note.onUpdate({
				authMode: 'lambda',
				authToken: 'some-token',
			}).subscribe({
				next(value) {
					expect(spy).toHaveBeenCalledWith(
						expect.objectContaining({
							authenticationType: 'lambda',
						}),
						USER_AGENT_DETAILS
					);
					done();
				},
				error(error) {
					expect(error).toBeUndefined();
					done('bad news!');
				},
			});
		});

		test('can subscribe to onDelete()', done => {
			const noteToSend = {
				__typename: 'Note',
				...serverManagedFields,
				body: 'a very good note',
			};

			const graphqlMessage = {
				data: {
					onDeleteNote: noteToSend,
				},
			};

			const client = generateClient<Schema>({ amplify: Amplify });

			const spy = jest.fn(() => from([graphqlMessage]));
			(raw.GraphQLAPI as any).appSyncRealTime = { subscribe: spy };

			client.models.Note.onDelete({
				authMode: 'lambda',
				authToken: 'some-token',
			}).subscribe({
				next(value) {
					expect(spy).toHaveBeenCalledWith(
						expect.objectContaining({
							authenticationType: 'lambda',
						}),
						USER_AGENT_DETAILS
					);
					done();
				},
				error(error) {
					expect(error).toBeUndefined();
					done('bad news!');
				},
			});
		});

		describe('can lazy load with inherited authMode', () => {
			test('can lazy load @hasMany', async () => {
				mockApiResponse({
					data: {
						getTodo: {
							__typename: 'Todo',
							...serverManagedFields,
							id: 'todo-id',
							name: 'some name',
							description: 'something something',
						},
					},
				});

				const client = generateClient<Schema>({ amplify: Amplify });
				const { data } = await client.models.Todo.get(
					{ id: 'todo-id' },
					{ authMode: 'lambda', authToken: 'some-token' }
				);

				const getChildNotesSpy = mockApiResponse({
					data: {
						listNotes: {
							items: [
								{
									__typename: 'Note',
									...serverManagedFields,
									id: 'note-id',
									body: 'some body',
								},
							],
						},
					},
				});

				await data.notes();

				expect(getChildNotesSpy).toHaveBeenCalledWith(
					expect.objectContaining({
						options: expect.objectContaining({
							headers: expect.objectContaining({
								Authorization: 'some-token',
							}),
							body: {
								query: expect.stringContaining(
									'listNotes(filter: $filter, limit: $limit, nextToken: $nextToken)'
								),
								variables: {
									filter: {
										and: [{ todoNotesId: { eq: 'todo-id' } }],
									},
								},
							},
						}),
					})
				);
			});

			test('can lazy load @belongsTo', async () => {
				mockApiResponse({
					data: {
						getNote: {
							__typename: 'Note',
							...serverManagedFields,
							id: 'note-id',
							body: 'some body',
							todoNotesId: 'todo-id',
						},
					},
				});

				const client = generateClient<Schema>({ amplify: Amplify });
				const { data } = await client.models.Note.get(
					{ id: 'note-id' },
					{
						authMode: 'lambda',
						authToken: 'some-token',
					}
				);

				const getChildNotesSpy = mockApiResponse({
					data: {
						getTodo: {
							__typename: 'Todo',
							...serverManagedFields,
							id: 'todo-id',
							name: 'some name',
							description: 'something something',
						},
					},
				});

				await data.todo();

				expect(getChildNotesSpy).toHaveBeenCalledWith(
					expect.objectContaining({
						options: expect.objectContaining({
							headers: expect.objectContaining({
								Authorization: 'some-token',
							}),
							body: {
								query: expect.stringContaining('getTodo(id: $id)'),
								variables: {
									id: 'todo-id',
								},
							},
						}),
					})
				);
			});

			test('can lazy load @hasOne', async () => {
				mockApiResponse({
					data: {
						getTodo: {
							__typename: 'Todo',
							...serverManagedFields,
							id: 'todo-id',
							body: 'some body',
							todoMetaId: 'meta-id',
						},
					},
				});

				const client = generateClient<Schema>({ amplify: Amplify });
				const { data } = await client.models.Todo.get(
					{ id: 'todo-id' },
					{
						authMode: 'lambda',
						authToken: 'some-token',
					}
				);

				const getChildMetaSpy = mockApiResponse({
					data: {
						getTodoMetadata: {
							__typename: 'TodoMetadata',
							...serverManagedFields,
							id: 'meta-id',
							data: '{"field":"value"}',
						},
					},
				});

				await data.meta();

				expect(getChildMetaSpy).toHaveBeenCalledWith(
					expect.objectContaining({
						options: expect.objectContaining({
							headers: expect.objectContaining({
								Authorization: 'some-token',
							}),
							body: {
								query: expect.stringContaining('getTodoMetadata(id: $id)'),
								variables: {
									id: 'meta-id',
								},
							},
						}),
					})
				);
			});
		});

		describe('can lazy load with overridden authMode', () => {
			test('can lazy load @hasMany', async () => {
				mockApiResponse({
					data: {
						getTodo: {
							__typename: 'Todo',
							...serverManagedFields,
							id: 'todo-id',
							name: 'some name',
							description: 'something something',
						},
					},
				});

				const client = generateClient<Schema>({ amplify: Amplify });
				const { data } = await client.models.Todo.get(
					{ id: 'todo-id' },
					{ authMode: 'userPool' }
				);

				const getChildNotesSpy = mockApiResponse({
					data: {
						listNotes: {
							items: [
								{
									__typename: 'Note',
									...serverManagedFields,
									id: 'note-id',
									body: 'some body',
								},
							],
						},
					},
				});

				await data.notes({ authMode: 'lambda', authToken: 'some-token' });

				expect(getChildNotesSpy).toHaveBeenCalledWith(
					expect.objectContaining({
						options: expect.objectContaining({
							headers: expect.objectContaining({
								Authorization: 'some-token',
							}),
							body: {
								query: expect.stringContaining(
									'listNotes(filter: $filter, limit: $limit, nextToken: $nextToken)'
								),
								variables: {
									filter: {
										and: [{ todoNotesId: { eq: 'todo-id' } }],
									},
								},
							},
						}),
					})
				);
			});

			test('can lazy load @belongsTo', async () => {
				mockApiResponse({
					data: {
						getNote: {
							__typename: 'Note',
							...serverManagedFields,
							id: 'note-id',
							body: 'some body',
							todoNotesId: 'todo-id',
						},
					},
				});

				const client = generateClient<Schema>({ amplify: Amplify });
				const { data } = await client.models.Note.get(
					{ id: 'note-id' },
					{
						authMode: 'userPool',
					}
				);

				const getChildNotesSpy = mockApiResponse({
					data: {
						getTodo: {
							__typename: 'Todo',
							...serverManagedFields,
							id: 'todo-id',
							name: 'some name',
							description: 'something something',
						},
					},
				});

				await data.todo({ authMode: 'lambda', authToken: 'some-token' });

				expect(getChildNotesSpy).toHaveBeenCalledWith(
					expect.objectContaining({
						options: expect.objectContaining({
							headers: expect.objectContaining({
								Authorization: 'some-token',
							}),
							body: {
								query: expect.stringContaining('getTodo(id: $id)'),
								variables: {
									id: 'todo-id',
								},
							},
						}),
					})
				);
			});

			test('can lazy load @hasOne', async () => {
				mockApiResponse({
					data: {
						getTodo: {
							__typename: 'Todo',
							...serverManagedFields,
							id: 'todo-id',
							body: 'some body',
							todoMetaId: 'meta-id',
						},
					},
				});

				const client = generateClient<Schema>({ amplify: Amplify });
				const { data } = await client.models.Todo.get(
					{ id: 'todo-id' },
					{
						authMode: 'userPool',
					}
				);

				const getChildMetaSpy = mockApiResponse({
					data: {
						getTodoMetadata: {
							__typename: 'TodoMetadata',
							...serverManagedFields,
							id: 'meta-id',
							data: '{"field":"value"}',
						},
					},
				});

				await data.meta({ authMode: 'lambda', authToken: 'some-token' });

				expect(getChildMetaSpy).toHaveBeenCalledWith(
					expect.objectContaining({
						options: expect.objectContaining({
							headers: expect.objectContaining({
								Authorization: 'some-token',
							}),
							body: {
								query: expect.stringContaining('getTodoMetadata(id: $id)'),
								variables: {
									id: 'meta-id',
								},
							},
						}),
					})
				);
			});
		});
	});

	describe('basic model operations - authMode: CuP override in the client', () => {
		beforeEach(() => {
			jest.clearAllMocks();
			Amplify.configure(configFixture as any);

			jest
				.spyOn(Amplify.Auth, 'fetchAuthSession')
				.mockImplementation(async () => {
					return {
						tokens: {
							accessToken: {
								toString: () => 'test',
							},
						},
						credentials: {
							accessKeyId: 'test',
							secretAccessKey: 'test',
						},
					} as any;
				});
		});

		test('can create()', async () => {
			const spy = mockApiResponse({
				data: {
					createTodo: {
						__typename: 'Todo',
						...serverManagedFields,
						name: 'some name',
						description: 'something something',
					},
				},
			});

			const client = generateClient<Schema>({
				amplify: Amplify,
				authMode: 'userPool',
			});
			await client.models.Todo.create({
				name: 'some name',
				description: 'something something',
			});

			expect(spy).toHaveBeenCalledWith(
				expect.objectContaining({
					options: expect.objectContaining({
						headers: expect.objectContaining({
							Authorization: 'test',
						}),
						body: {
							query: expect.stringContaining('createTodo(input: $input)'),
							variables: {
								input: {
									name: 'some name',
									description: 'something something',
								},
							},
						},
					}),
				})
			);
		});

		test('can get()', async () => {
			const spy = mockApiResponse({
				data: {
					getTodo: {
						__typename: 'Todo',
						...serverManagedFields,
						name: 'some name',
						description: 'something something',
					},
				},
			});

			const client = generateClient<Schema>({
				amplify: Amplify,
				authMode: 'userPool',
			});
			await client.models.Todo.get({ id: 'asdf' });

			expect(spy).toHaveBeenCalledWith(
				expect.objectContaining({
					options: expect.objectContaining({
						headers: expect.objectContaining({
							Authorization: 'test',
						}),
						body: {
							query: expect.stringContaining('getTodo(id: $id)'),
							variables: {
								id: 'asdf',
							},
						},
					}),
				})
			);
		});

		test('can list()', async () => {
			const spy = mockApiResponse({
				data: {
					listTodos: {
						items: [
							{
								__typename: 'Todo',
								...serverManagedFields,
								name: 'some name',
								description: 'something something',
							},
						],
					},
				},
			});

			const client = generateClient<Schema>({
				amplify: Amplify,
				authMode: 'userPool',
			});
			await client.models.Todo.list({
				filter: { name: { contains: 'name' } },
			});

			expect(spy).toHaveBeenCalledWith(
				expect.objectContaining({
					options: expect.objectContaining({
						headers: expect.objectContaining({
							Authorization: 'test',
						}),
						body: {
							query: expect.stringContaining(
								'listTodos(filter: $filter, limit: $limit, nextToken: $nextToken)'
							),
							variables: {
								filter: {
									name: {
										contains: 'name',
									},
								},
							},
						},
					}),
				})
			);
		});

		test('can update()', async () => {
			const spy = mockApiResponse({
				data: {
					updateTodo: {
						__typename: 'Todo',
						...serverManagedFields,
						name: 'some other name',
						description: 'something something',
					},
				},
			});

			const client = generateClient<Schema>({
				amplify: Amplify,
				authMode: 'userPool',
			});
			await client.models.Todo.update({
				id: 'some-id',
				name: 'some other name',
			});

			expect(spy).toHaveBeenCalledWith(
				expect.objectContaining({
					options: expect.objectContaining({
						headers: expect.objectContaining({
							Authorization: 'test',
						}),
						body: {
							query: expect.stringContaining('updateTodo(input: $input)'),
							variables: {
								input: {
									id: 'some-id',
									name: 'some other name',
								},
							},
						},
					}),
				})
			);
		});

		test('can delete()', async () => {
			const spy = mockApiResponse({
				data: {
					deleteTodo: {
						__typename: 'Todo',
						...serverManagedFields,
						name: 'some name',
						description: 'something something',
					},
				},
			});

			const client = generateClient<Schema>({
				amplify: Amplify,
				authMode: 'userPool',
			});
			await client.models.Todo.delete({
				id: 'some-id',
			});

			expect(spy).toHaveBeenCalledWith(
				expect.objectContaining({
					options: expect.objectContaining({
						headers: expect.objectContaining({
							Authorization: 'test',
						}),
						body: {
							query: expect.stringContaining('deleteTodo(input: $input)'),
							variables: {
								input: {
									id: 'some-id',
								},
							},
						},
					}),
				})
			);
		});

		test('can subscribe to onCreate()', done => {
			const noteToSend = {
				__typename: 'Note',
				...serverManagedFields,
				body: 'a very good note',
			};

			const graphqlMessage = {
				data: {
					onCreateNote: noteToSend,
				},
			};

			const client = generateClient<Schema>({
				amplify: Amplify,
				authMode: 'userPool',
			});

			const spy = jest.fn(() => from([graphqlMessage]));
			(raw.GraphQLAPI as any).appSyncRealTime = { subscribe: spy };

			client.models.Note.onCreate().subscribe({
				next(value) {
					expect(spy).toHaveBeenCalledWith(
						expect.objectContaining({
							authenticationType: 'userPool',
						}),
						USER_AGENT_DETAILS
					);
					done();
				},
				error(error) {
					expect(error).toBeUndefined();
					done('bad news!');
				},
			});
		});

		test('can subscribe to onUpdate()', done => {
			const noteToSend = {
				__typename: 'Note',
				...serverManagedFields,
				body: 'a very good note',
			};

			const graphqlMessage = {
				data: {
					onUpdateNote: noteToSend,
				},
			};

			const client = generateClient<Schema>({
				amplify: Amplify,
				authMode: 'userPool',
			});

			const spy = jest.fn(() => from([graphqlMessage]));
			(raw.GraphQLAPI as any).appSyncRealTime = { subscribe: spy };

			client.models.Note.onUpdate().subscribe({
				next(value) {
					expect(spy).toHaveBeenCalledWith(
						expect.objectContaining({
							authenticationType: 'userPool',
						}),
						USER_AGENT_DETAILS
					);
					done();
				},
				error(error) {
					expect(error).toBeUndefined();
					done('bad news!');
				},
			});
		});

		test('can subscribe to onDelete()', done => {
			const noteToSend = {
				__typename: 'Note',
				...serverManagedFields,
				body: 'a very good note',
			};

			const graphqlMessage = {
				data: {
					onDeleteNote: noteToSend,
				},
			};

			const client = generateClient<Schema>({
				amplify: Amplify,
				authMode: 'userPool',
			});

			const spy = jest.fn(() => from([graphqlMessage]));
			(raw.GraphQLAPI as any).appSyncRealTime = { subscribe: spy };

			client.models.Note.onDelete().subscribe({
				next(value) {
					expect(spy).toHaveBeenCalledWith(
						expect.objectContaining({
							authenticationType: 'userPool',
						}),
						USER_AGENT_DETAILS
					);
					done();
				},
				error(error) {
					expect(error).toBeUndefined();
					done('bad news!');
				},
			});
		});

		describe('can lazy load with inherited authMode', () => {
			test('can lazy load @hasMany', async () => {
				mockApiResponse({
					data: {
						getTodo: {
							__typename: 'Todo',
							...serverManagedFields,
							id: 'todo-id',
							name: 'some name',
							description: 'something something',
						},
					},
				});

				const client = generateClient<Schema>({
					amplify: Amplify,
					authMode: 'userPool',
				});
				const { data } = await client.models.Todo.get({ id: 'todo-id' });

				const getChildNotesSpy = mockApiResponse({
					data: {
						listNotes: {
							items: [
								{
									__typename: 'Note',
									...serverManagedFields,
									id: 'note-id',
									body: 'some body',
								},
							],
						},
					},
				});

				await data.notes();

				expect(getChildNotesSpy).toHaveBeenCalledWith(
					expect.objectContaining({
						options: expect.objectContaining({
							headers: expect.objectContaining({
								Authorization: 'test',
							}),
							body: {
								query: expect.stringContaining(
									'listNotes(filter: $filter, limit: $limit, nextToken: $nextToken)'
								),
								variables: {
									filter: {
										and: [{ todoNotesId: { eq: 'todo-id' } }],
									},
								},
							},
						}),
					})
				);
			});

			test('can lazy load @belongsTo', async () => {
				mockApiResponse({
					data: {
						getNote: {
							__typename: 'Note',
							...serverManagedFields,
							id: 'note-id',
							body: 'some body',
							todoNotesId: 'todo-id',
						},
					},
				});

				const client = generateClient<Schema>({
					amplify: Amplify,
					authMode: 'userPool',
				});
				const { data } = await client.models.Note.get({ id: 'note-id' });

				const getChildNotesSpy = mockApiResponse({
					data: {
						getTodo: {
							__typename: 'Todo',
							...serverManagedFields,
							id: 'todo-id',
							name: 'some name',
							description: 'something something',
						},
					},
				});

				await data.todo();

				expect(getChildNotesSpy).toHaveBeenCalledWith(
					expect.objectContaining({
						options: expect.objectContaining({
							headers: expect.objectContaining({
								Authorization: 'test',
							}),
							body: {
								query: expect.stringContaining('getTodo(id: $id)'),
								variables: {
									id: 'todo-id',
								},
							},
						}),
					})
				);
			});

			test('can lazy load @hasOne', async () => {
				mockApiResponse({
					data: {
						getTodo: {
							__typename: 'Todo',
							...serverManagedFields,
							id: 'todo-id',
							body: 'some body',
							todoMetaId: 'meta-id',
						},
					},
				});

				const client = generateClient<Schema>({
					amplify: Amplify,
					authMode: 'userPool',
				});
				const { data } = await client.models.Todo.get({ id: 'todo-id' });

				const getChildMetaSpy = mockApiResponse({
					data: {
						getTodoMetadata: {
							__typename: 'TodoMetadata',
							...serverManagedFields,
							id: 'meta-id',
							data: '{"field":"value"}',
						},
					},
				});

				await data.meta();

				expect(getChildMetaSpy).toHaveBeenCalledWith(
					expect.objectContaining({
						options: expect.objectContaining({
							headers: expect.objectContaining({
								Authorization: 'test',
							}),
							body: {
								query: expect.stringContaining('getTodoMetadata(id: $id)'),
								variables: {
									id: 'meta-id',
								},
							},
						}),
					})
				);
			});
		});

		describe('can lazy load with overridden authMode', () => {
			test('can lazy load @hasMany', async () => {
				mockApiResponse({
					data: {
						getTodo: {
							__typename: 'Todo',
							...serverManagedFields,
							id: 'todo-id',
							name: 'some name',
							description: 'something something',
						},
					},
				});

				const client = generateClient<Schema>({
					amplify: Amplify,
					authMode: 'userPool',
				});
				const { data } = await client.models.Todo.get({ id: 'todo-id' });

				const getChildNotesSpy = mockApiResponse({
					data: {
						listNotes: {
							items: [
								{
									__typename: 'Note',
									...serverManagedFields,
									id: 'note-id',
									body: 'some body',
								},
							],
						},
					},
				});

				await data.notes({ authMode: 'apiKey' });

				expect(getChildNotesSpy).toHaveBeenCalledWith(
					expect.objectContaining({
						options: expect.objectContaining({
							headers: expect.objectContaining({
								'X-Api-Key': 'FAKE-KEY',
							}),
							body: {
								query: expect.stringContaining(
									'listNotes(filter: $filter, limit: $limit, nextToken: $nextToken)'
								),
								variables: {
									filter: {
										and: [{ todoNotesId: { eq: 'todo-id' } }],
									},
								},
							},
						}),
					})
				);
			});

			test('can lazy load @belongsTo', async () => {
				mockApiResponse({
					data: {
						getNote: {
							__typename: 'Note',
							...serverManagedFields,
							id: 'note-id',
							body: 'some body',
							todoNotesId: 'todo-id',
						},
					},
				});

				const client = generateClient<Schema>({
					amplify: Amplify,
					authMode: 'userPool',
				});
				const { data } = await client.models.Note.get({ id: 'note-id' });

				const getChildNotesSpy = mockApiResponse({
					data: {
						getTodo: {
							__typename: 'Todo',
							...serverManagedFields,
							id: 'todo-id',
							name: 'some name',
							description: 'something something',
						},
					},
				});

				await data.todo({ authMode: 'apiKey' });

				expect(getChildNotesSpy).toHaveBeenCalledWith(
					expect.objectContaining({
						options: expect.objectContaining({
							headers: expect.objectContaining({
								'X-Api-Key': 'FAKE-KEY',
							}),
							body: {
								query: expect.stringContaining('getTodo(id: $id)'),
								variables: {
									id: 'todo-id',
								},
							},
						}),
					})
				);
			});

			test('can lazy load @hasOne', async () => {
				mockApiResponse({
					data: {
						getTodo: {
							__typename: 'Todo',
							...serverManagedFields,
							id: 'todo-id',
							body: 'some body',
							todoMetaId: 'meta-id',
						},
					},
				});

				const client = generateClient<Schema>({
					amplify: Amplify,
					authMode: 'userPool',
				});
				const { data } = await client.models.Todo.get({ id: 'todo-id' });

				const getChildMetaSpy = mockApiResponse({
					data: {
						getTodoMetadata: {
							__typename: 'TodoMetadata',
							...serverManagedFields,
							id: 'meta-id',
							data: '{"field":"value"}',
						},
					},
				});

				await data.meta({ authMode: 'apiKey' });

				expect(getChildMetaSpy).toHaveBeenCalledWith(
					expect.objectContaining({
						options: expect.objectContaining({
							headers: expect.objectContaining({
								'X-Api-Key': 'FAKE-KEY',
							}),
							body: {
								query: expect.stringContaining('getTodoMetadata(id: $id)'),
								variables: {
									id: 'meta-id',
								},
							},
						}),
					})
				);
			});
		});
	});

	describe('basic model operations - authMode: lambda override in the client', () => {
		beforeEach(() => {
			jest.clearAllMocks();
			Amplify.configure(configFixture as any);

			jest
				.spyOn(Amplify.Auth, 'fetchAuthSession')
				.mockImplementation(async () => {
					return {
						tokens: {
							accessToken: {
								toString: () => 'test',
							},
						},
						credentials: {
							accessKeyId: 'test',
							secretAccessKey: 'test',
						},
					} as any;
				});
		});

		test('can create()', async () => {
			const spy = mockApiResponse({
				data: {
					createTodo: {
						__typename: 'Todo',
						...serverManagedFields,
						name: 'some name',
						description: 'something something',
					},
				},
			});

			const client = generateClient<Schema>({
				amplify: Amplify,
				authMode: 'lambda',
				authToken: 'some-token',
			});
			await client.models.Todo.create({
				name: 'some name',
				description: 'something something',
			});

			expect(spy).toHaveBeenCalledWith(
				expect.objectContaining({
					options: expect.objectContaining({
						headers: expect.objectContaining({
							Authorization: 'some-token',
						}),
						body: {
							query: expect.stringContaining('createTodo(input: $input)'),
							variables: {
								input: {
									name: 'some name',
									description: 'something something',
								},
							},
						},
					}),
				})
			);
		});

		test('can get()', async () => {
			const spy = mockApiResponse({
				data: {
					getTodo: {
						__typename: 'Todo',
						...serverManagedFields,
						name: 'some name',
						description: 'something something',
					},
				},
			});

			const client = generateClient<Schema>({
				amplify: Amplify,
				authMode: 'lambda',
				authToken: 'some-token',
			});
			await client.models.Todo.get({ id: 'asdf' });

			expect(spy).toHaveBeenCalledWith(
				expect.objectContaining({
					options: expect.objectContaining({
						headers: expect.objectContaining({
							Authorization: 'some-token',
						}),
						body: {
							query: expect.stringContaining('getTodo(id: $id)'),
							variables: {
								id: 'asdf',
							},
						},
					}),
				})
			);
		});

		test('can list()', async () => {
			const spy = mockApiResponse({
				data: {
					listTodos: {
						items: [
							{
								__typename: 'Todo',
								...serverManagedFields,
								name: 'some name',
								description: 'something something',
							},
						],
					},
				},
			});

			const client = generateClient<Schema>({
				amplify: Amplify,
				authMode: 'lambda',
				authToken: 'some-token',
			});
			await client.models.Todo.list({
				filter: { name: { contains: 'name' } },
			});

			expect(spy).toHaveBeenCalledWith(
				expect.objectContaining({
					options: expect.objectContaining({
						headers: expect.objectContaining({
							Authorization: 'some-token',
						}),
						body: {
							query: expect.stringContaining(
								'listTodos(filter: $filter, limit: $limit, nextToken: $nextToken)'
							),
							variables: {
								filter: {
									name: {
										contains: 'name',
									},
								},
							},
						},
					}),
				})
			);
		});

		test('can update()', async () => {
			const spy = mockApiResponse({
				data: {
					updateTodo: {
						__typename: 'Todo',
						...serverManagedFields,
						name: 'some other name',
						description: 'something something',
					},
				},
			});

			const client = generateClient<Schema>({
				amplify: Amplify,
				authMode: 'lambda',
				authToken: 'some-token',
			});
			await client.models.Todo.update({
				id: 'some-id',
				name: 'some other name',
			});

			expect(spy).toHaveBeenCalledWith(
				expect.objectContaining({
					options: expect.objectContaining({
						headers: expect.objectContaining({
							Authorization: 'some-token',
						}),
						body: {
							query: expect.stringContaining('updateTodo(input: $input)'),
							variables: {
								input: {
									id: 'some-id',
									name: 'some other name',
								},
							},
						},
					}),
				})
			);
		});

		test('can delete()', async () => {
			const spy = mockApiResponse({
				data: {
					deleteTodo: {
						__typename: 'Todo',
						...serverManagedFields,
						name: 'some name',
						description: 'something something',
					},
				},
			});

			const client = generateClient<Schema>({
				amplify: Amplify,
				authMode: 'lambda',
				authToken: 'some-token',
			});
			await client.models.Todo.delete({
				id: 'some-id',
			});

			expect(spy).toHaveBeenCalledWith(
				expect.objectContaining({
					options: expect.objectContaining({
						headers: expect.objectContaining({
							Authorization: 'some-token',
						}),
						body: {
							query: expect.stringContaining('deleteTodo(input: $input)'),
							variables: {
								input: {
									id: 'some-id',
								},
							},
						},
					}),
				})
			);
		});

		test('can subscribe to onCreate()', done => {
			const noteToSend = {
				__typename: 'Note',
				...serverManagedFields,
				body: 'a very good note',
			};

			const graphqlMessage = {
				data: {
					onCreateNote: noteToSend,
				},
			};

			const client = generateClient<Schema>({
				amplify: Amplify,
				authMode: 'lambda',
				authToken: 'some-token',
			});

			const spy = jest.fn(() => from([graphqlMessage]));
			(raw.GraphQLAPI as any).appSyncRealTime = { subscribe: spy };

			client.models.Note.onCreate().subscribe({
				next(value) {
					expect(spy).toHaveBeenCalledWith(
						expect.objectContaining({
							authenticationType: 'lambda',
						}),
						USER_AGENT_DETAILS
					);
					done();
				},
				error(error) {
					expect(error).toBeUndefined();
					done('bad news!');
				},
			});
		});

		test('can subscribe to onUpdate()', done => {
			const noteToSend = {
				__typename: 'Note',
				...serverManagedFields,
				body: 'a very good note',
			};

			const graphqlMessage = {
				data: {
					onUpdateNote: noteToSend,
				},
			};

			const client = generateClient<Schema>({
				amplify: Amplify,
				authMode: 'lambda',
				authToken: 'some-token',
			});

			const spy = jest.fn(() => from([graphqlMessage]));
			(raw.GraphQLAPI as any).appSyncRealTime = { subscribe: spy };

			client.models.Note.onUpdate().subscribe({
				next(value) {
					expect(spy).toHaveBeenCalledWith(
						expect.objectContaining({
							authenticationType: 'lambda',
						}),
						USER_AGENT_DETAILS
					);
					done();
				},
				error(error) {
					expect(error).toBeUndefined();
					done('bad news!');
				},
			});
		});

		test('can subscribe to onDelete()', done => {
			const noteToSend = {
				__typename: 'Note',
				...serverManagedFields,
				body: 'a very good note',
			};

			const graphqlMessage = {
				data: {
					onDeleteNote: noteToSend,
				},
			};

			const client = generateClient<Schema>({
				amplify: Amplify,
				authMode: 'lambda',
				authToken: 'some-token',
			});

			const spy = jest.fn(() => from([graphqlMessage]));
			(raw.GraphQLAPI as any).appSyncRealTime = { subscribe: spy };

			client.models.Note.onDelete().subscribe({
				next(value) {
					expect(spy).toHaveBeenCalledWith(
						expect.objectContaining({
							authenticationType: 'lambda',
						}),
						USER_AGENT_DETAILS
					);
					done();
				},
				error(error) {
					expect(error).toBeUndefined();
					done('bad news!');
				},
			});
		});

		describe('can lazy load with inherited authMode', () => {
			test('can lazy load @hasMany', async () => {
				mockApiResponse({
					data: {
						getTodo: {
							__typename: 'Todo',
							...serverManagedFields,
							id: 'todo-id',
							name: 'some name',
							description: 'something something',
						},
					},
				});

				const client = generateClient<Schema>({
					amplify: Amplify,
					authMode: 'lambda',
					authToken: 'some-token',
				});
				const { data } = await client.models.Todo.get({ id: 'todo-id' });

				const getChildNotesSpy = mockApiResponse({
					data: {
						listNotes: {
							items: [
								{
									__typename: 'Note',
									...serverManagedFields,
									id: 'note-id',
									body: 'some body',
								},
							],
						},
					},
				});

				await data.notes();

				expect(getChildNotesSpy).toHaveBeenCalledWith(
					expect.objectContaining({
						options: expect.objectContaining({
							headers: expect.objectContaining({
								Authorization: 'some-token',
							}),
							body: {
								query: expect.stringContaining(
									'listNotes(filter: $filter, limit: $limit, nextToken: $nextToken)'
								),
								variables: {
									filter: {
										and: [{ todoNotesId: { eq: 'todo-id' } }],
									},
								},
							},
						}),
					})
				);
			});

			test('can lazy load @belongsTo', async () => {
				mockApiResponse({
					data: {
						getNote: {
							__typename: 'Note',
							...serverManagedFields,
							id: 'note-id',
							body: 'some body',
							todoNotesId: 'todo-id',
						},
					},
				});

				const client = generateClient<Schema>({
					amplify: Amplify,
					authMode: 'lambda',
					authToken: 'some-token',
				});
				const { data } = await client.models.Note.get({ id: 'note-id' });

				const getChildNotesSpy = mockApiResponse({
					data: {
						getTodo: {
							__typename: 'Todo',
							...serverManagedFields,
							id: 'todo-id',
							name: 'some name',
							description: 'something something',
						},
					},
				});

				await data.todo();

				expect(getChildNotesSpy).toHaveBeenCalledWith(
					expect.objectContaining({
						options: expect.objectContaining({
							headers: expect.objectContaining({
								Authorization: 'some-token',
							}),
							body: {
								query: expect.stringContaining('getTodo(id: $id)'),
								variables: {
									id: 'todo-id',
								},
							},
						}),
					})
				);
			});

			test('can lazy load @hasOne', async () => {
				mockApiResponse({
					data: {
						getTodo: {
							__typename: 'Todo',
							...serverManagedFields,
							id: 'todo-id',
							body: 'some body',
							todoMetaId: 'meta-id',
						},
					},
				});

				const client = generateClient<Schema>({
					amplify: Amplify,
					authMode: 'lambda',
					authToken: 'some-token',
				});
				const { data } = await client.models.Todo.get({ id: 'todo-id' });

				const getChildMetaSpy = mockApiResponse({
					data: {
						getTodoMetadata: {
							__typename: 'TodoMetadata',
							...serverManagedFields,
							id: 'meta-id',
							data: '{"field":"value"}',
						},
					},
				});

				await data.meta();

				expect(getChildMetaSpy).toHaveBeenCalledWith(
					expect.objectContaining({
						options: expect.objectContaining({
							headers: expect.objectContaining({
								Authorization: 'some-token',
							}),
							body: {
								query: expect.stringContaining('getTodoMetadata(id: $id)'),
								variables: {
									id: 'meta-id',
								},
							},
						}),
					})
				);
			});
		});

		describe('can lazy load with overridden authMode', () => {
			test('can lazy load @hasMany', async () => {
				mockApiResponse({
					data: {
						getTodo: {
							__typename: 'Todo',
							...serverManagedFields,
							id: 'todo-id',
							name: 'some name',
							description: 'something something',
						},
					},
				});

				const client = generateClient<Schema>({
					amplify: Amplify,
					authMode: 'userPool',
				});
				const { data } = await client.models.Todo.get({ id: 'todo-id' });

				const getChildNotesSpy = mockApiResponse({
					data: {
						listNotes: {
							items: [
								{
									__typename: 'Note',
									...serverManagedFields,
									id: 'note-id',
									body: 'some body',
								},
							],
						},
					},
				});

				await data.notes({ authMode: 'lambda', authToken: 'some-token' });

				expect(getChildNotesSpy).toHaveBeenCalledWith(
					expect.objectContaining({
						options: expect.objectContaining({
							headers: expect.objectContaining({
								Authorization: 'some-token',
							}),
							body: {
								query: expect.stringContaining(
									'listNotes(filter: $filter, limit: $limit, nextToken: $nextToken)'
								),
								variables: {
									filter: {
										and: [{ todoNotesId: { eq: 'todo-id' } }],
									},
								},
							},
						}),
					})
				);
			});

			test('can lazy load @belongsTo', async () => {
				mockApiResponse({
					data: {
						getNote: {
							__typename: 'Note',
							...serverManagedFields,
							id: 'note-id',
							body: 'some body',
							todoNotesId: 'todo-id',
						},
					},
				});

				const client = generateClient<Schema>({
					amplify: Amplify,
					authMode: 'userPool',
				});
				const { data } = await client.models.Note.get({ id: 'note-id' });

				const getChildNotesSpy = mockApiResponse({
					data: {
						getTodo: {
							__typename: 'Todo',
							...serverManagedFields,
							id: 'todo-id',
							name: 'some name',
							description: 'something something',
						},
					},
				});

				await data.todo({ authMode: 'lambda', authToken: 'some-token' });

				expect(getChildNotesSpy).toHaveBeenCalledWith(
					expect.objectContaining({
						options: expect.objectContaining({
							headers: expect.objectContaining({
								Authorization: 'some-token',
							}),
							body: {
								query: expect.stringContaining('getTodo(id: $id)'),
								variables: {
									id: 'todo-id',
								},
							},
						}),
					})
				);
			});

			test('can lazy load @hasOne', async () => {
				mockApiResponse({
					data: {
						getTodo: {
							__typename: 'Todo',
							...serverManagedFields,
							id: 'todo-id',
							body: 'some body',
							todoMetaId: 'meta-id',
						},
					},
				});

				const client = generateClient<Schema>({
					amplify: Amplify,
					authMode: 'userPool',
				});
				const { data } = await client.models.Todo.get({ id: 'todo-id' });

				const getChildMetaSpy = mockApiResponse({
					data: {
						getTodoMetadata: {
							__typename: 'TodoMetadata',
							...serverManagedFields,
							id: 'meta-id',
							data: '{"field":"value"}',
						},
					},
				});

				await data.meta({ authMode: 'lambda', authToken: 'some-token' });

				expect(getChildMetaSpy).toHaveBeenCalledWith(
					expect.objectContaining({
						options: expect.objectContaining({
							headers: expect.objectContaining({
								Authorization: 'some-token',
							}),
							body: {
								query: expect.stringContaining('getTodoMetadata(id: $id)'),
								variables: {
									id: 'meta-id',
								},
							},
						}),
					})
				);
			});
		});
	});

	describe('observeQuery', () => {
		beforeEach(() => {
			jest.clearAllMocks();
			Amplify.configure(configFixture as any);
		});

		test('can see initial results', done => {
			const client = generateClient<Schema>({ amplify: Amplify });

			mockApiResponse({
				data: {
					listTodos: {
						items: [
							{
								__typename: 'Todo',
								...serverManagedFields,
								name: 'some name',
								description: 'something something',
							},
						],
						nextToken: null,
					},
				},
			});

			const { streams, spy } = makeAppSyncStreams();

			client.models.Todo.observeQuery().subscribe({
				next({ items, isSynced }) {
					expect(isSynced).toBe(true);
					expect(items).toEqual([
						expect.objectContaining({
							__typename: 'Todo',
							...serverManagedFields,
							name: 'some name',
							description: 'something something',
						}),
					]);
					done();
				},
			});
		});

		test('can paginate through initial results', done => {
			const client = generateClient<Schema>({ amplify: Amplify });
			const { streams } = makeAppSyncStreams();

			let spy = mockApiResponse({
				data: {
					listTodos: {
						items: [
							{
								__typename: 'Todo',
								...serverManagedFields,
								name: 'first todo',
								description: 'something something first',
							},
						],
						nextToken: 'sometoken',
					},
				},
			});

			let isFirstResult = true;

			client.models.Todo.observeQuery().subscribe({
				next({ items, isSynced }) {
					if (isFirstResult) {
						isFirstResult = false;
						expect(isSynced).toBe(false);
						expect(items).toEqual([
							expect.objectContaining({
								__typename: 'Todo',
								...serverManagedFields,
								name: 'first todo',
								description: 'something something first',
							}),
						]);
						spy = mockApiResponse({
							data: {
								listTodos: {
									items: [
										{
											__typename: 'Todo',
											...serverManagedFields,
											name: 'second todo',
											description: 'something something second',
										},
									],
									nextToken: undefined,
								},
							},
						});
					} else {
						expect(isSynced).toBe(true);
						expect(items).toEqual([
							expect.objectContaining({
								__typename: 'Todo',
								...serverManagedFields,
								name: 'first todo',
								description: 'something something first',
							}),
							expect.objectContaining({
								__typename: 'Todo',
								...serverManagedFields,
								name: 'second todo',
								description: 'something something second',
							}),
						]);

						// ensure we actually got a request that included our next token
						expect(spy).toHaveBeenCalledWith(
							expect.objectContaining({
								options: expect.objectContaining({
									body: expect.objectContaining({
										variables: expect.objectContaining({
											nextToken: 'sometoken',
										}),
									}),
								}),
							})
						);

						done();
					}
				},
			});
		});

		test('can see creates - with non-empty query result', async done => {
			const client = generateClient<Schema>({ amplify: Amplify });

			mockApiResponse({
				data: {
					listTodos: {
						items: [
							{
								__typename: 'Todo',
								...serverManagedFields,
								name: 'initial record',
								description: 'something something',
							},
						],
						nextToken: null,
					},
				},
			});

			const { streams, spy } = makeAppSyncStreams();

			let firstSnapshot = true;
			client.models.Todo.observeQuery().subscribe({
				next({ items, isSynced }) {
					if (firstSnapshot) {
						firstSnapshot = false;
						expect(items).toEqual([
							expect.objectContaining({
								__typename: 'Todo',
								...serverManagedFields,
								name: 'initial record',
								description: 'something something',
							}),
						]);
						setTimeout(() => {
							streams.create?.next({
								data: {
									onCreateTodo: {
										__typename: 'Todo',
										...serverManagedFields,
										id: 'different-id',
										name: 'observed record',
										description: 'something something',
									},
								},
							});
						}, 1);
					} else {
						expect(items).toEqual([
							expect.objectContaining({
								__typename: 'Todo',
								...serverManagedFields,
								name: 'initial record',
								description: 'something something',
							}),
							expect.objectContaining({
								__typename: 'Todo',
								...serverManagedFields,
								id: 'different-id',
								name: 'observed record',
								description: 'something something',
							}),
						]);
						done();
					}
				},
			});
		});

		test('can see creates - with empty query result', async done => {
			const client = generateClient<Schema>({ amplify: Amplify });

			mockApiResponse({
				data: {
					listTodos: {
						items: [],
						nextToken: null,
					},
				},
			});

			const { streams, spy } = makeAppSyncStreams();

			let firstSnapshot = true;
			client.models.Todo.observeQuery().subscribe({
				next({ items, isSynced }) {
					if (firstSnapshot) {
						firstSnapshot = false;
						expect(items).toEqual([]);
						setTimeout(() => {
							streams.create?.next({
								data: {
									onCreateTodo: {
										__typename: 'Todo',
										...serverManagedFields,
										id: 'observed-id',
										name: 'observed record',
										description: 'something something',
									},
								},
							});
						}, 1);
					} else {
						expect(items).toEqual([
							expect.objectContaining({
								__typename: 'Todo',
								...serverManagedFields,
								id: 'observed-id',
								name: 'observed record',
								description: 'something something',
							}),
						]);
						done();
					}
				},
			});
		});

		test('can see onCreates that are received prior to fetch completion', async done => {
			const client = generateClient<Schema>({ amplify: Amplify });

			// to record which order
			const callSequence = [] as string[];

			// get an API list response "started", but delayed, so that it returns
			// *after* we get a subscription messages sent to the client.
			mockApiResponse(
				new Promise(resolve => {
					const result = {
						data: {
							listTodos: {
								items: [
									{
										__typename: 'Todo',
										...serverManagedFields,
										name: 'initial record',
										description: 'something something',
									},
								],
								nextToken: null,
							},
						},
					};
					setTimeout(() => {
						callSequence.push('list');
						resolve(result);
					}, 15);
				})
			);

			const { streams, spy } = makeAppSyncStreams();

			let firstSnapshot = true;
			client.models.Todo.observeQuery().subscribe({
				next({ items, isSynced }) {
					if (firstSnapshot) {
						firstSnapshot = false;
						expect(items).toEqual([
							expect.objectContaining({
								__typename: 'Todo',
								...serverManagedFields,
								name: 'initial record',
								description: 'something something',
							}),
						]);
					} else {
						expect(items).toEqual([
							expect.objectContaining({
								__typename: 'Todo',
								...serverManagedFields,
								name: 'initial record',
								description: 'something something',
							}),
							expect.objectContaining({
								__typename: 'Todo',
								...serverManagedFields,
								id: 'different-id',
								name: 'observed record',
								description: 'something something',
							}),
						]);
						expect(callSequence).toEqual(['onCreate', 'list']);
						done();
					}
				},
			});

			streams.create?.next({
				data: {
					onCreateTodo: {
						__typename: 'Todo',
						...serverManagedFields,
						id: 'different-id',
						name: 'observed record',
						description: 'something something',
					},
				},
			});
			callSequence.push('onCreate');
		});

		test('can see onUpdates that are received prior to fetch completion', async done => {
			const client = generateClient<Schema>({ amplify: Amplify });

			// to record which order
			const callSequence = [] as string[];

			// get an API list response "started", but delayed, so that it returns
			// *after* we get a subscription messages sent to the client.
			mockApiResponse(
				new Promise(resolve => {
					const result = {
						data: {
							listTodos: {
								items: [
									{
										__typename: 'Todo',
										...serverManagedFields,
										name: 'initial record',
										description: 'something something',
									},
								],
								nextToken: null,
							},
						},
					};
					setTimeout(() => {
						callSequence.push('list');
						resolve(result);
					}, 15);
				})
			);

			const { streams, spy } = makeAppSyncStreams();

			let firstSnapshot = true;
			client.models.Todo.observeQuery().subscribe({
				next({ items, isSynced }) {
					if (firstSnapshot) {
						firstSnapshot = false;
						expect(items).toEqual([
							expect.objectContaining({
								__typename: 'Todo',
								...serverManagedFields,
								name: 'initial record',
								description: 'something something',
							}),
						]);
					} else {
						expect(items).toEqual([
							expect.objectContaining({
								__typename: 'Todo',
								...serverManagedFields,
								name: 'initial record - UPDATED',
								description: 'something something',
							}),
						]);
						expect(callSequence).toEqual(['onUpdate', 'list']);
						done();
					}
				},
			});

			streams.update?.next({
				data: {
					onUpdateTodo: {
						__typename: 'Todo',
						...serverManagedFields,
						id: 'some-id',
						name: 'initial record - UPDATED',
						description: 'something something',
					},
				},
			});
			callSequence.push('onUpdate');
		});

		test('can see onDeletes that are received prior to fetch completion', async done => {
			const client = generateClient<Schema>({ amplify: Amplify });

			// to record which order
			const callSequence = [] as string[];

			// get an API list response "started", but delayed, so that it returns
			// *after* we get a subscription messages sent to the client.
			mockApiResponse(
				new Promise(resolve => {
					const result = {
						data: {
							listTodos: {
								items: [
									{
										__typename: 'Todo',
										...serverManagedFields,
										name: 'initial record',
										description: 'something something',
									},
								],
								nextToken: null,
							},
						},
					};
					setTimeout(() => {
						callSequence.push('list');
						resolve(result);
					}, 15);
				})
			);

			const { streams, spy } = makeAppSyncStreams();

			let firstSnapshot = true;
			client.models.Todo.observeQuery().subscribe({
				next({ items, isSynced }) {
					if (firstSnapshot) {
						firstSnapshot = false;
						expect(items).toEqual([
							expect.objectContaining({
								__typename: 'Todo',
								...serverManagedFields,
								name: 'initial record',
								description: 'something something',
							}),
						]);
					} else {
						expect(items).toEqual([]);
						expect(callSequence).toEqual(['onDelete', 'list']);
						done();
					}
				},
			});

			streams.delete?.next({
				data: {
					onDeleteTodo: {
						__typename: 'Todo',
						...serverManagedFields,
						id: 'some-id',
						name: 'initial record',
						description: 'something something',
					},
				},
			});
			callSequence.push('onDelete');
		});

		test('can see updates', async done => {
			const client = generateClient<Schema>({ amplify: Amplify });

			mockApiResponse({
				data: {
					listTodos: {
						items: [
							{
								__typename: 'Todo',
								...serverManagedFields,
								name: 'initial record',
								description: 'something something',
							},
						],
						nextToken: null,
					},
				},
			});

			const { streams, spy } = makeAppSyncStreams();

			let firstSnapshot = true;
			client.models.Todo.observeQuery().subscribe({
				next({ items, isSynced }) {
					if (firstSnapshot) {
						firstSnapshot = false;
						expect(items).toEqual([
							expect.objectContaining({
								__typename: 'Todo',
								...serverManagedFields,
								name: 'initial record',
								description: 'something something',
							}),
						]);
						setTimeout(() => {
							streams.update?.next({
								data: {
									onCreateTodo: {
										__typename: 'Todo',
										...serverManagedFields,
										name: 'updated record',
										description: 'something something',
									},
								},
							});
						}, 1);
					} else {
						expect(items).toEqual([
							expect.objectContaining({
								__typename: 'Todo',
								...serverManagedFields,
								name: 'updated record',
								description: 'something something',
							}),
						]);
						done();
					}
				},
			});
		});

		test('can see deletions', async done => {
			const client = generateClient<Schema>({ amplify: Amplify });

			mockApiResponse({
				data: {
					listTodos: {
						items: [
							{
								__typename: 'Todo',
								...serverManagedFields,
								name: 'initial record',
								description: 'something something',
							},
						],
						nextToken: null,
					},
				},
			});

			const { streams, spy } = makeAppSyncStreams();

			let firstSnapshot = true;
			client.models.Todo.observeQuery().subscribe({
				next({ items, isSynced }) {
					if (firstSnapshot) {
						firstSnapshot = false;
						expect(items).toEqual([
							expect.objectContaining({
								__typename: 'Todo',
								...serverManagedFields,
								name: 'initial record',
								description: 'something something',
							}),
						]);
						setTimeout(() => {
							streams.delete?.next({
								data: {
									onCreateTodo: {
										__typename: 'Todo',
										...serverManagedFields,
										name: 'initial record',
										description: 'something something',
									},
								},
							});
						}, 1);
					} else {
						expect(items).toEqual([]);
						done();
					}
				},
			});
		});

		describe('auth modes', () => {
			beforeEach(async () => {
				jest.clearAllMocks();
				Amplify.configure(configFixture as any);

				jest
					.spyOn(Amplify.Auth, 'fetchAuthSession')
					.mockImplementation(async () => {
						return {
							tokens: {
								accessToken: {
									toString: () => 'test',
								},
							},
							credentials: {
								accessKeyId: 'test',
								secretAccessKey: 'test',
							},
						} as any;
					});
			});

			test('uses configured authMode by default', async done => {
				const client = generateClient<Schema>({ amplify: Amplify });
				mockApiResponse({
					data: {
						listTodos: {
							items: [],
							nextToken: null,
						},
					},
				});
				const { spy } = makeAppSyncStreams();
				client.models.Todo.observeQuery().subscribe({
					next() {
						for (const op of ['onCreateTodo', 'onUpdateTodo', 'onDeleteTodo']) {
							expect(spy).toHaveBeenCalledWith(
								expect.objectContaining({
									query: expect.stringContaining(op),
									// configured fixture value is expected be `apiKey` for this test
									authenticationType: 'apiKey',
								}),
								USER_AGENT_DETAILS
							);
						}
						done();
					},
				});
			});

			test('uses provided authMode at call site', async done => {
				const client = generateClient<Schema>({ amplify: Amplify });
				mockApiResponse({
					data: {
						listTodos: {
							items: [],
							nextToken: null,
						},
					},
				});
				const { spy } = makeAppSyncStreams();
				client.models.Todo.observeQuery({ authMode: 'userPool' }).subscribe({
					next() {
						for (const op of ['onCreateTodo', 'onUpdateTodo', 'onDeleteTodo']) {
							expect(spy).toHaveBeenCalledWith(
								expect.objectContaining({
									query: expect.stringContaining(op),
									authenticationType: 'userPool',
								}),
								USER_AGENT_DETAILS
							);
						}
						done();
					},
				});
			});

			test('uses provided authToken at call site', async done => {
				const client = generateClient<Schema>({ amplify: Amplify });
				mockApiResponse({
					data: {
						listTodos: {
							items: [],
							nextToken: null,
						},
					},
				});
				const { spy } = makeAppSyncStreams();
				client.models.Todo.observeQuery({
					authMode: 'lambda',
					authToken: 'some-token',
				}).subscribe({
					next() {
						for (const op of ['onCreateTodo', 'onUpdateTodo', 'onDeleteTodo']) {
							expect(spy).toHaveBeenCalledWith(
								expect.objectContaining({
									query: expect.stringContaining(op),
									authenticationType: 'lambda',
									additionalHeaders: expect.objectContaining({
										Authorization: 'some-token',
									}),
								}),
								USER_AGENT_DETAILS
							);
						}
						done();
					},
				});
			});

			test('uses provided authMode from the client', async done => {
				const client = generateClient<Schema>({
					amplify: Amplify,
					authMode: 'userPool',
				});
				mockApiResponse({
					data: {
						listTodos: {
							items: [],
							nextToken: null,
						},
					},
				});
				const { spy } = makeAppSyncStreams();
				client.models.Todo.observeQuery().subscribe({
					next() {
						for (const op of ['onCreateTodo', 'onUpdateTodo', 'onDeleteTodo']) {
							expect(spy).toHaveBeenCalledWith(
								expect.objectContaining({
									query: expect.stringContaining(op),
									authenticationType: 'userPool',
								}),
								USER_AGENT_DETAILS
							);
						}
						done();
					},
				});
			});

			test('uses provided authToken from the client', async done => {
				const client = generateClient<Schema>({
					amplify: Amplify,
					authMode: 'lambda',
					authToken: 'some-token',
				});
				mockApiResponse({
					data: {
						listTodos: {
							items: [],
							nextToken: null,
						},
					},
				});
				const { spy } = makeAppSyncStreams();
				client.models.Todo.observeQuery().subscribe({
					next() {
						for (const op of ['onCreateTodo', 'onUpdateTodo', 'onDeleteTodo']) {
							expect(spy).toHaveBeenCalledWith(
								expect.objectContaining({
									query: expect.stringContaining(op),
									authenticationType: 'lambda',
									additionalHeaders: expect.objectContaining({
										Authorization: 'some-token',
									}),
								}),
								USER_AGENT_DETAILS
							);
						}
						done();
					},
				});
			});
		});
	});

	describe.only('related model mutations', () => {
		beforeEach(() => {
			jest.clearAllMocks();
			Amplify.configure(configFixture as any);
		});

		test('create with hasOne', async () => {
			const spy = mockApiResponse({
				data: {
					createTodo: {
						__typename: 'Todo',
						...serverManagedFields,
						name: 'some name',
						description: 'something something',
						todoMetaId: 'meta-data-id-i-guess',
					},
				},
			});

			const client = generateClient<Schema>({ amplify: Amplify });
			const { data } = await client.models.Todo.create({
				name: 'some name',
				description: 'something something',
				meta: {
					id: 'meta-data-id-i-guess',
				},
			});

			expect(spy).toHaveBeenCalledWith(
				expect.objectContaining({
					options: expect.objectContaining({
						headers: expect.objectContaining({
							'X-Api-Key': 'FAKE-KEY',
						}),
						body: {
							query: expect.stringContaining('createTodo(input: $input)'),
							variables: {
								input: {
									name: 'some name',
									description: 'something something',
									todoMetaId: 'meta-data-id-i-guess',
								},
							},
						},
					}),
				})
			);
		});

		test('create with "blessed" hasOne from API response', async () => {
			const client = generateClient<Schema>({ amplify: Amplify });

			const metaSpy = mockApiResponse({
				data: {
					getTodoMetadata: {
						__typename: 'TodoMetadata',
						...serverManagedFields,
						id: 'some-metadata-id',
						data: 'something something something',
					},
				},
			});

			const { data: meta } = await client.models.TodoMetadata.get({
				id: 'whatever',
			});

			const spy = mockApiResponse({
				data: {
					createTodo: {
						__typename: 'Todo',
						...serverManagedFields,
						name: 'some name',
						description: 'something something',
						todoMetaId: 'some-metadata-id',
					},
				},
			});

			const { data } = await client.models.Todo.create({
				name: 'some name',
				description: 'something something',
				meta,
			});

			expect(spy).toHaveBeenCalledWith(
				expect.objectContaining({
					options: expect.objectContaining({
						headers: expect.objectContaining({
							'X-Api-Key': 'FAKE-KEY',
						}),
						body: {
							query: expect.stringContaining('createTodo(input: $input)'),
							variables: {
								input: {
									name: 'some name',
									description: 'something something',
									todoMetaId: meta.id,
								},
							},
						},
					}),
				})
			);
		});

		test('create with hasMany - reciprocal belongsTo', async () => {
			const client = generateClient<Schema>({ amplify: Amplify });

			const spy = mockApiResponse({
				data: {
					// doesn't matter
					createNote: {
						__typename: 'Note',
						...serverManagedFields,
					},
				},
			});

			const { data: note } = await client.models.Note.create({
				body: 'some body',
				todo: {
					id: 'heres-a-todo',
				},
			});

			expect(spy).toHaveBeenCalledWith(
				expect.objectContaining({
					options: expect.objectContaining({
						headers: expect.objectContaining({
							'X-Api-Key': 'FAKE-KEY',
						}),
						body: {
							query: expect.stringContaining('createNote(input: $input)'),
							variables: {
								input: {
									body: 'some body',
									todoNotesId: 'heres-a-todo',
								},
							},
						},
					}),
				})
			);
		});

		test('create with "blessed" hasMany from API response - reciprocal belongsTo', async () => {
			const client = generateClient<Schema>({ amplify: Amplify });

			mockApiResponse({
				data: {
					createTodo: {
						__typename: 'Todo',
						...serverManagedFields,
						id: 'heres-a-todo',
						name: 'some name',
						description: 'something something',
					},
				},
			});

			const { data: todo } = await client.models.Todo.create({
				name: 'some name',
				description: 'something something',
			});

			const spy = mockApiResponse({
				data: {
					// doesn't matter
					createNote: {
						__typename: 'Note',
						...serverManagedFields,
					},
				},
			});

			await client.models.Note.create({
				body: 'some body',
				todo,
			});

			expect(spy).toHaveBeenCalledWith(
				expect.objectContaining({
					options: expect.objectContaining({
						headers: expect.objectContaining({
							'X-Api-Key': 'FAKE-KEY',
						}),
						body: {
							query: expect.stringContaining('createNote(input: $input)'),
							variables: {
								input: {
									body: 'some body',
									todoNotesId: 'heres-a-todo',
								},
							},
						},
					}),
				})
			);
		});

		test('create with hasMany - no belongsTo', async () => {
			const client = generateClient<Schema>({ amplify: Amplify });

			const spy = mockApiResponse({
				data: {
					// doesn't matter
					createMember: {
						__typename: 'Member',
						...serverManagedFields,
					},
				},
			});

			const { data: note } = await client.models.Member.create({
				name: 'some body',
				team: {
					id: 'something',
				},
			});

			expect(spy).toHaveBeenCalledWith(
				expect.objectContaining({
					options: expect.objectContaining({
						headers: expect.objectContaining({
							'X-Api-Key': 'FAKE-KEY',
						}),
						body: {
							query: expect.stringContaining('createTeam(input: $input)'),
							variables: {
								input: {
									name: 'some body',
									teamMembersId: 'something',
								},
							},
						},
					}),
				})
			);
		});

		test('create with "blessed" hasMany from API response - no belongsTo', async () => {
			const client = generateClient<Schema>({ amplify: Amplify });

			mockApiResponse({
				data: {
					createTeam: {
						__typename: 'Team',
						...serverManagedFields,
						id: 'heres-a-team',
						mantra: 'a mantra',
					},
				},
			});

			const { data: team } = await client.models.Team.create({
				mantra: 'a mantra',
			});

			const spy = mockApiResponse({
				data: {
					// doesn't matter
					createMember: {
						__typename: 'Member',
						...serverManagedFields,
					},
				},
			});

			await client.models.Member.create({
				name: 'some body',
				team,
			});

			expect(spy).toHaveBeenCalledWith(
				expect.objectContaining({
					options: expect.objectContaining({
						headers: expect.objectContaining({
							'X-Api-Key': 'FAKE-KEY',
						}),
						body: {
							query: expect.stringContaining('createMember(input: $input)'),
							variables: {
								input: {
									name: 'some body',
									teamMembersId: 'heres-a-team',
								},
							},
						},
					}),
				})
			);
		});
	});
});
