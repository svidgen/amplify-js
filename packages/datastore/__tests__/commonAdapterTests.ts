import { parse } from 'graphql';
import {
	DataStore as DataStoreType,
	PersistentModelConstructor,
	initSchema as initSchemaType,
} from '../src/';

import {
	pause,
	expectMutation,
	Model,
	User,
	Profile,
	Post,
	Comment,
	testSchema,
} from './helpers';
import Observable from 'zen-observable-ts';
import { NormalModuleReplacementPlugin } from 'webpack';

export { pause };

/**
 * Adds common query test cases that all adapters should support.
 *
 * @param ctx A context object that provides a DataStore property, which returns
 * a DataStore instance loaded with the storage adapter to test.
 */
export function addCommonQueryTests({
	initSchema,
	DataStore,
	storageAdapter,
	getMutations,
	clearOutbox,
}) {
	describe('Common `query()` cases', () => {
		let Model: PersistentModelConstructor<Model>;
		let Comment: PersistentModelConstructor<Comment>;
		let Post: PersistentModelConstructor<Post>;

		/**
		 * Creates the given number of models, with `field1` populated to
		 * `field1 value ${i}`.
		 *
		 * @param qty number of models to create. (default 3)
		 */
		async function addModels(qty = 3) {
			// NOTE: sort() test on these models can be flaky unless we
			// strictly control the datestring of each! In a non-negligible percentage
			// of test runs on a reasonably fast machine, DataStore.save() seemed to return
			// quickly enough that dates were colliding. (or so it seemed!)
			const baseDate = new Date();

			for (let i = 0; i < qty; i++) {
				await DataStore.save(
					new Model({
						field1: `field1 value ${i}`,
						dateCreated: new Date(baseDate.getTime() + i).toISOString(),
						emails: [`field${i}@example.com`],
					})
				);
			}
		}

		beforeEach(async () => {
			DataStore.configure({ storageAdapter });

			// establishing a fake appsync endpoint tricks DataStore into attempting
			// sync operations, which we'll leverage to monitor how DataStore manages
			// the outbox.
			(DataStore as any).amplifyConfig.aws_appsync_graphqlEndpoint =
				'https://0.0.0.0/does/not/exist/graphql';

			const classes = initSchema(testSchema());
			({ Comment, Model, Post } = classes as {
				Comment: PersistentModelConstructor<Comment>;
				Model: PersistentModelConstructor<Model>;
				Post: PersistentModelConstructor<Post>;
			});
			await DataStore.clear();

			// start() ensures storageAdapter is set
			await DataStore.start();

			const adapter = (DataStore as any).storageAdapter;
			const db = (adapter as any).db;
			const syncEngine = (DataStore as any).sync;

			// my jest spy-fu wasn't up to snuff here. but, this succesfully
			// prevents the mutation process from clearing the mutation queue, which
			// allows us to observe the state of mutations.
			(syncEngine as any).mutationsProcessor.isReady = () => false;

			await addModels(3);
		});

		afterEach(async () => {
			await pause(100);
			await DataStore.start();
			await DataStore.clear();

			// prevent cross-contamination with other test suites that are not ~literally~
			// expecting sync call counts to be ZERO.
			(DataStore as any).amplifyConfig.aws_appsync_graphqlEndpoint = '';
		});

		it('should match fields of any non-empty value for `("ne", undefined)`', async () => {
			const results = await DataStore.query(Model, m =>
				m.field1('ne', undefined)
			);
			expect(results.length).toEqual(3);
		});

		it('should match fields of any non-empty value for `("ne", null)`', async () => {
			const results = await DataStore.query(Model, m => m.field1('ne', null));
			expect(results.length).toEqual(3);
		});

		it('should NOT match fields of any non-empty value for `("eq", undefined)`', async () => {
			const results = await DataStore.query(Model, m =>
				m.field1('eq', undefined)
			);
			expect(results.length).toEqual(0);
		});

		it('should NOT match fields of any non-empty value for `("eq", null)`', async () => {
			const results = await DataStore.query(Model, m => m.field1('eq', null));
			expect(results.length).toEqual(0);
		});

		it('should NOT match fields of any non-empty value for `("gt", null)`', async () => {
			const results = await DataStore.query(Model, m => m.field1('gt', null));
			expect(results.length).toEqual(0);
		});

		it('should NOT  match fields of any non-empty value for `("ge", null)`', async () => {
			const results = await DataStore.query(Model, m => m.field1('ge', null));
			expect(results.length).toEqual(0);
		});

		it('should NOT match fields of any non-empty value for `("lt", null)`', async () => {
			const results = await DataStore.query(Model, m => m.field1('lt', null));
			expect(results.length).toEqual(0);
		});

		it('should NOT match fields of any non-empty value for `("le", null)`', async () => {
			const results = await DataStore.query(Model, m => m.field1('le', null));
			expect(results.length).toEqual(0);
		});

		it('should NOT match fields of any non-empty value for `("gt", undefined)`', async () => {
			const results = await DataStore.query(Model, m =>
				m.field1('gt', undefined)
			);
			expect(results.length).toEqual(0);
		});

		it('should NOT match fields of any non-empty value for `("ge", undefined)`', async () => {
			const results = await DataStore.query(Model, m =>
				m.field1('ge', undefined)
			);
			expect(results.length).toEqual(0);
		});

		it('should NOT match fields of any non-empty value for `("lt", undefined)`', async () => {
			const results = await DataStore.query(Model, m =>
				m.field1('lt', undefined)
			);
			expect(results.length).toEqual(0);
		});

		it('should NOT match fields of any non-empty value for `("le", undefined)`', async () => {
			const results = await DataStore.query(Model, m =>
				m.field1('le', undefined)
			);
			expect(results.length).toEqual(0);
		});

		it('should match gt', async () => {
			const results = await DataStore.query(Model, m =>
				m.field1('gt', 'field1 value 0')
			);
			expect(results.length).toEqual(2);
		});

		it('should match ge', async () => {
			const results = await DataStore.query(Model, m =>
				m.field1('ge', 'field1 value 1')
			);
			expect(results.length).toEqual(2);
		});

		it('should match lt', async () => {
			const results = await DataStore.query(Model, m =>
				m.field1('lt', 'field1 value 2')
			);
			expect(results.length).toEqual(2);
		});

		it('should match le', async () => {
			const results = await DataStore.query(Model, m =>
				m.field1('le', 'field1 value 1')
			);
			expect(results.length).toEqual(2);
		});

		it('should match eq', async () => {
			const results = await DataStore.query(Model, m =>
				m.field1('eq', 'field1 value 1')
			);
			expect(results.length).toEqual(1);
		});

		it('should match ne', async () => {
			const results = await DataStore.query(Model, m =>
				m.field1('ne', 'field1 value 1')
			);
			expect(results.length).toEqual(2);
		});
	});

	describe('Common `save()` cases', () => {
		let Comment: PersistentModelConstructor<Comment>;
		let Post: PersistentModelConstructor<Post>;
		let Profile: PersistentModelConstructor<Profile>;
		let User: PersistentModelConstructor<User>;
		let adapter: any;

		beforeEach(async () => {
			DataStore.configure({ storageAdapter });

			// establishing a fake appsync endpoint tricks DataStore into attempting
			// sync operations, which we'll leverage to monitor how DataStore manages
			// the outbox.
			(DataStore as any).amplifyConfig.aws_appsync_graphqlEndpoint =
				'https://0.0.0.0/does/not/exist/graphql';

			const classes = initSchema(testSchema());
			({ User, Profile, Comment, Post } = classes as {
				Comment: PersistentModelConstructor<Comment>;
				Model: PersistentModelConstructor<Model>;
				Post: PersistentModelConstructor<Post>;
				Profile: PersistentModelConstructor<Profile>;
				User: PersistentModelConstructor<User>;
			});
			await DataStore.clear();

			// start() ensures storageAdapter is set
			await DataStore.start();

			adapter = (DataStore as any).storageAdapter;
			const db = (adapter as any).db;
			const syncEngine = (DataStore as any).sync;

			// my jest spy-fu wasn't up to snuff here. but, this succesfully
			// prevents the mutation process from clearing the mutation queue, which
			// allows us to observe the state of mutations.
			(syncEngine as any).mutationsProcessor.isReady = () => false;
		});

		afterEach(async () => {
			await pause(100);
			await DataStore.start();
			await DataStore.clear();
			(DataStore as any).amplifyConfig.aws_appsync_graphqlEndpoint = '';
		});

		it('should allow linking model via model field', async () => {
			const profile = await DataStore.save(
				new Profile({ firstName: 'Rick', lastName: 'Bob' })
			);

			const savedUser = await DataStore.save(
				new User({ name: 'test', profile })
			);
			const user1Id = savedUser.id;

			const user = await DataStore.query(User, user1Id);
			expect(user.profileID).toEqual(profile.id);
			expect(user.profile).toEqual(profile);
		});

		it('should allow linking model via FK', async () => {
			const profile = await DataStore.save(
				new Profile({ firstName: 'Rick', lastName: 'Bob' })
			);

			const savedUser = await DataStore.save(
				new User({ name: 'test', profileID: profile.id })
			);
			const user1Id = savedUser.id;

			const user = await DataStore.query(User, user1Id);
			expect(user.profileID).toEqual(profile.id);
			expect(user.profile).toEqual(profile);
		});

		it('should produce a single mutation for an updated model with a BelongTo (regression test)', async () => {
			// SQLite adapter, for example, was producing an extra mutation
			// in this scenario.

			const post = await DataStore.save(
				new Post({
					title: 'some post',
				})
			);

			const comment = await DataStore.save(
				new Comment({
					content: 'some comment',
					post,
				})
			);

			const updatedComment = await DataStore.save(
				Comment.copyOf(comment, draft => {
					draft.content = 'updated content';
				})
			);

			const mutations = await getMutations(adapter);

			// comment update should be smashed to together with post
			expect(mutations.length).toBe(2);
			expectMutation(mutations[0], { title: 'some post' });
			expectMutation(mutations[1], {
				content: 'updated content',
				postId: mutations[0].modelId,
			});
		});

		it('should produce a mutation for a nested BELONGS_TO insert', async () => {
			const comment = await DataStore.save(
				new Comment({
					content: 'newly created comment',
					post: new Post({
						title: 'newly created post',
					}),
				})
			);

			const mutations = await getMutations(adapter);

			// one for the new comment, one for the new post
			expect(mutations.length).toBe(2);
			expectMutation(mutations[0], { title: 'newly created post' });
			expectMutation(mutations[1], {
				content: 'newly created comment',
				postId: mutations[0].modelId,
			});
		});

		it('only includes changed fields in mutations', async () => {
			const profile = await DataStore.save(
				new Profile({ firstName: 'original first', lastName: 'original last' })
			);

			await clearOutbox(adapter);

			await DataStore.save(
				Profile.copyOf(profile, draft => {
					draft.firstName = 'new first';
				})
			);

			const mutations = await getMutations(adapter);

			expect(mutations.length).toBe(1);
			expectMutation(mutations[0], {
				firstName: 'new first',
				_version: v => v === undefined || v === null,
				_lastChangedAt: v => v === undefined || v === null,
				_deleted: v => v === undefined || v === null,
			});
		});
	});

	describe.only('Common race conditions', () => {
		let Comment: PersistentModelConstructor<Comment>;
		let Model: PersistentModelConstructor<Model>;
		let Post: PersistentModelConstructor<Post>;
		let Profile: PersistentModelConstructor<Profile>;
		let User: PersistentModelConstructor<User>;
		let adapter: any;

		beforeEach(async () => {
			DataStore.configure({ storageAdapter });

			// establishing a fake appsync endpoint tricks DataStore into attempting
			// sync operations, which we'll leverage to monitor how DataStore manages
			// the outbox.
			(DataStore as any).amplifyConfig.aws_appsync_graphqlEndpoint =
				'https://0.0.0.0/does/not/exist/graphql';

			const classes = initSchema(testSchema());
			({ User, Profile, Comment, Model, Post } = classes as {
				Comment: PersistentModelConstructor<Comment>;
				Model: PersistentModelConstructor<Model>;
				Post: PersistentModelConstructor<Post>;
				Profile: PersistentModelConstructor<Profile>;
				User: PersistentModelConstructor<User>;
			});
			await DataStore.clear();

			// start() ensures storageAdapter is set
			await DataStore.stop();
			await DataStore.start();

			adapter = (DataStore as any).storageAdapter;
			const db = (adapter as any).db;
			const syncEngine = (DataStore as any).sync;

			// my jest spy-fu wasn't up to snuff here. but, this succesfully
			// prevents the mutation process from clearing the mutation queue, which
			// allows us to observe the state of mutations.
			jest
				.spyOn((syncEngine as any).mutationsProcessor, 'isReady')
				.mockImplementation(() => false);
		});

		afterEach(async () => {
			await pause(100);
			await DataStore.start();
			await DataStore.clear();
			await DataStore.stop();
			// (DataStore as any).amplifyConfig.aws_appsync_graphqlEndpoint = '';
			console.log('afterEach bottom');
			jest.clearAllMocks();
		});

		it('something something something dark side', async () => {
			const service = new PermissiveGraphQLServiceFake();
			await DataStore.save(new Post({ title: 'post title' }));
			console.log('HERE');

			console.log('requests', service.requests);

			await pause(1000);

			expect(true).toBe(true);

			console.log('AND HERE');
		});
	});

	/**
	 * Statefully pretends to be AppSync, with minimal built-in asertions with
	 * error callbacks and settings to help simulate various conditions.
	 */
	class PermissiveGraphQLServiceFake {
		public requests = [];
		public tables = new Map<string, Map<string, any[]>>();
		public observers = new Map<string, Observable<any>[]>();

		constructor() {
			const { API } = require('@aws-amplify/api');
			jest.spyOn(API, 'graphql').mockImplementation(async (o: any) => {
				// console.log('handling request', {
				// 	...o,
				// 	query: this.parseQuery(o.query),
				// });
				const response = this.request(o);
				// console.log('response', JSON.stringify(response, null, 2));
				return response;
				// return null;
			});
		}

		public parseQuery(query) {
			const q = (parse(query) as any).definitions[0];
			const operation = q.operation;
			const name = q.name.value;
			const selections = q.selectionSet.selections[0];
			const selection = selections.name.value;
			const type = selection.match(
				/^(create|sync|get|list|onCreate|onUpdate|onDelete)(\w+)$/
			)[1];

			let table;
			if (type === 'sync' || type === 'list') {
				table = selection.match(/^(create|sync|get|list)(\w+)s$/)[2];
			} else {
				table = selection.match(
					/^(create|sync|get|list|onCreate|onUpdate|onDelete)(\w+)$/
				)[2];
			}

			const items =
				operation === 'query'
					? selections?.selectionSet?.selections[0]?.selectionSet?.selections?.map(
							i => i.name.value
					  )
					: selections?.selectionSet?.selections?.map(i => i.name.value);

			return { operation, name, selection, type, table, items };
		}

		public subscribe(selection, observer) {
			this.getObservers(selection).push(observer);
		}

		public getObservers(selection) {
			if (!this.observers.has(selection)) this.observers.set(selection, []);
			return this.observers.get(selection);
		}

		public getTable(name): Map<string, any> {
			if (!this.tables.has(name))
				this.tables.set(name, new Map<string, any[]>());
			return this.tables.get(name);
		}

		public async request({ query, variables, authMode, authToken }) {
			const {
				operation,
				selection,
				table: tableName,
				type,
			} = this.parseQuery(query);
			this.requests.push({ query, variables, authMode, authToken });
			let data;

			const table = this.getTable(tableName);

			if (operation === 'query') {
				if (type === 'get') {
					data = { [selection]: table.get(variables.input.id) };
				} else if (type === 'list' || type === 'sync') {
					data = {
						[selection]: {
							items: [...table.values()],
							nextToken: null,
							startedAt: new Date().getTime(),
						},
					};
				}
			} else if (operation === 'mutation') {
				if (type === 'create' || type === 'update') {
					table.set(variables.input.id, variables.input);
				} else if (type === 'delete') {
					table.delete(variables.input.id);
				}
				data = { [selection]: variables.input };
			} else if (operation === 'subscription') {
				// return new Observable(observer => {
				// 	this.subscribe(selection, observer);
				// 	// needs to return { value: { data: { [opname]: record }, errors: [] } }
				// });
			}

			// observer.next() will go here.

			return {
				data,
				errors: [],
				extensions: {},
			};
		}
	}

	// 	/*
	// 	const serverData = <
	// 			GraphQLResult<Record<string, PersistentModel>>
	// 		>await API.graphql({
	// 			query,
	// 			variables: { id: variables.input.id },
	// 			authMode,
	// 			authToken,
	// 		});
	// 	*/
}
