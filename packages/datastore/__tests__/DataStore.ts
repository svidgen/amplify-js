import 'fake-indexeddb/auto';
import { decodeTime } from 'ulid';
import uuidValidate from 'uuid-validate';
import Observable from 'zen-observable-ts';
import {
	DataStore as DataStoreType,
	initSchema as initSchemaType,
} from '../src/datastore/datastore';
import { Predicates } from '../src/predicates';
import { ExclusiveStorage as StorageType } from '../src/storage/storage';
import {
	NonModelTypeConstructor,
	PersistentModel,
	PersistentModelConstructor,
} from '../src/types';
import { Comment, Model, Post, Metadata, testSchema } from './helpers';

let initSchema: typeof initSchemaType;
let DataStore: typeof DataStoreType;

const nameOf = <T>(name: keyof T) => name;

/**
 * Does nothing intentionally, we care only about type checking
 */
const expectType: <T>(param: T) => void = () => {};

describe('DataStore observe, unmocked, with fake-indexeddb', () => {
	let Comment: PersistentModelConstructor<Comment>;
	let Model: PersistentModelConstructor<Model>;
	let Post: PersistentModelConstructor<Post>;

	beforeEach(async () => {
		({ initSchema, DataStore } = require('../src/datastore/datastore'));
		const classes = initSchema(testSchema());
		({ Comment, Model, Post } = classes as {
			Comment: PersistentModelConstructor<Comment>;
			Model: PersistentModelConstructor<Model>;
			Post: PersistentModelConstructor<Post>;
		});
		await DataStore.clear();
	});

	test('subscribe to all models', async (done) => {
		DataStore.observe().subscribe(({ element, opType, model }) => {
			expectType<PersistentModelConstructor<PersistentModel>>(model);
			expectType<PersistentModel>(element);
			expect(opType).toEqual('INSERT');
			expect(element.field1).toEqual('Smurfs');
			done();
		});
		DataStore.save(
			new Model({
				field1: 'Smurfs',
				dateCreated: new Date().toISOString(),
			})
		);
	});

	test('subscribe to model instance', async (done) => {
		const original = await DataStore.save(
			new Model({
				field1: 'somevalue',
				dateCreated: new Date().toISOString(),
			})
		);

		DataStore.observe(original).subscribe(({ element, opType, model }) => {
			expectType<PersistentModelConstructor<Model>>(model);
			expectType<Model>(element);
			expect(opType).toEqual('UPDATE');
			expect(element.id).toEqual(original.id);
			expect(element.field1).toEqual('new field 1 value');
			done();
		});

		// decoy
		await DataStore.save(
			new Model({
				field1: "this one shouldn't get through",
				dateCreated: new Date().toISOString(),
			})
		);

		await DataStore.save(
			Model.copyOf(original, (m) => (m.field1 = 'new field 1 value'))
		);
	});

	test('subscribe to Model', async (done) => {
		const original = await DataStore.save(
			new Model({
				field1: 'somevalue',
				dateCreated: new Date().toISOString(),
			})
		);

		DataStore.observe(Model).subscribe(({ element, opType, model }) => {
			expectType<PersistentModelConstructor<Model>>(model);
			expectType<Model>(element);
			expect(opType).toEqual('UPDATE');
			expect(element.id).toEqual(original.id);
			expect(element.field1).toEqual('new field 1 value');
			done();
		});

		// decoy
		await DataStore.save(
			new Post({
				title: "This one's a decoy!",
			})
		);

		await DataStore.save(
			Model.copyOf(original, (m) => (m.field1 = 'new field 1 value'))
		);
	});

	test('subscribe with criteria', async (done) => {
		const original = await DataStore.save(
			new Model({
				field1: 'somevalue',
				dateCreated: new Date().toISOString(),
			})
		);

		DataStore.observe(Model, (m) => m.field1.contains('new field 1')).subscribe(
			({ element, opType, model }) => {
				expectType<PersistentModelConstructor<Model>>(model);
				expectType<Model>(element);
				expect(opType).toEqual('UPDATE');
				expect(element.id).toEqual(original.id);
				expect(element.field1).toEqual('new field 1 value');
				done();
			}
		);

		// decoy
		await DataStore.save(
			new Model({
				field1: "This one's a decoy!",
				dateCreated: new Date().toISOString(),
			})
		);

		await DataStore.save(
			Model.copyOf(original, (m) => (m.field1 = 'new field 1 value'))
		);
	});

	test('subscribe with criteria on deletes', async (done) => {
		const original = await DataStore.save(
			new Model({
				field1: 'somevalue',
				dateCreated: new Date().toISOString(),
			})
		);

		DataStore.observe(Model, (m) => m.field1.contains('value')).subscribe(
			({ element, opType, model }) => {
				expectType<PersistentModelConstructor<Model>>(model);
				expectType<Model>(element);
				expect(opType).toEqual('DELETE');
				expect(element.id).toEqual(original.id);
				expect(element.field1).toEqual('somevalue');
				done();
			}
		);

		// decoy
		await DataStore.save(
			new Model({
				field1: "This one's a decoy!",
				dateCreated: new Date().toISOString(),
			})
		);

		await DataStore.delete(original);
	});

	test('subscribe with belongsTo criteria', async (done) => {
		const targetPost = await DataStore.save(
			new Post({
				title: 'this is my post. hooray!',
			})
		);

		const nonTargetPost = await DataStore.save(
			new Post({
				title: 'this is NOT my post. boo!',
			})
		);

		DataStore.observe(Comment, (comment) =>
			comment.post.title.eq(targetPost.title)
		).subscribe(({ element: comment, opType, model }) => {
			expect(comment.content).toEqual('good comment');
			done();
		});

		await DataStore.save(
			new Comment({
				content: 'bad comment',
				post: nonTargetPost,
			})
		);

		await DataStore.save(
			new Comment({
				content: 'good comment',
				post: targetPost,
			})
		);
	});

	test('subscribe with hasMany criteria', async (done) => {
		// want to set up a few posts and a few "non-target" comments
		// to ensure we can observe post based on a single comment that's
		// somewhat "buried" alongside other comments.

		const targetPost = await DataStore.save(
			new Post({
				title: 'this is my post. hooray!',
			})
		);

		const nonTargetPost = await DataStore.save(
			new Post({
				title: 'this is NOT my post. boo!',
			})
		);

		const nonTargetComment = await DataStore.save(
			new Comment({
				content: 'bad comment',
				post: nonTargetPost,
			})
		);

		const targetPreComment = await DataStore.save(
			new Comment({
				content: 'pre good comment',
				post: targetPost,
			})
		);

		const targetComment = await DataStore.save(
			new Comment({
				content: 'good comment',
				post: targetPost,
			})
		);

		const targetPostComment = await DataStore.save(
			new Comment({
				content: 'post good comment',
				post: targetPost,
			})
		);

		// sanity check
		const targetPostFetched = await DataStore.query(Post, targetPost.id);
		expect((await targetPostFetched.comments.toArray()).length).toBe(3);
		expect(
			(await targetPostFetched.comments.toArray()).some(
				(c) => c.content === 'good comment'
			)
		);

		// const checkComment = await DataStore.query(Comment, targetComment.id);
		// console.log('check comment', await checkComment.post);

		// console.log('targetPost comments', await targetPost.comments.toArray());

		// const targetPostCopy = Post.copyOf(targetPost, p => p.title = "COPIED");
		// console.log('targetPost COPIED comments', await targetPostCopy.comments.toArray());

		DataStore.observe(Post, (post) =>
			post.comments.content.eq(targetComment.content)
		).subscribe(async ({ element: post, opType, model }) => {
			expect(post.title).toEqual('expected update');
			done();
		});

		// decoy edit
		await DataStore.save(
			Post.copyOf(nonTargetPost, (p) => (p.title = 'decoy update'))
		);

		// the update we're looking for
		await DataStore.save(
			Post.copyOf(targetPost, (p) => (p.title = 'expected update'))
		);
	});
	1;
});

describe('DataStore observeQuery, with fake-indexeddb and fake sync', () => {
	//
	// ~~~~ OH HEY! ~~~~~
	//
	// Remember that `observeQuery()` always issues a first snapshot from the data
	// already in storage. This is naturally performed async. Because of this,
	// if you insert items immediately after `observeQuery()`, some of those items
	// MAY show up in the initial snapshot. (Or maybe they won't!)
	//
	// Many of these tests should therefore include timeouts when adding records.
	// These timeouts let `observeQuery()` sneak in and grab its first snapshot
	// before those records hit storage, making for predictable tests.
	//
	// The tests should also account for that initial, empty snapshot.
	//
	// (And remember, snapshots are cumulative.)
	//
	// ~~~~ OK. Thanks! ~~~~
	//
	//   (That's it)
	//

	let Post: PersistentModelConstructor<Post>;

	beforeEach(async () => {
		({ initSchema, DataStore } = require('../src/datastore/datastore'));
		const classes = initSchema(testSchema());
		({ Post } = classes as {
			Post: PersistentModelConstructor<Post>;
		});
		await DataStore.clear();

		// Fully faking or mocking the sync engine would be pretty significant.
		// Instead, we're going to mocking a few sync engine methods we happen know
		// `observeQuery()` depends on.
		(DataStore as any).sync = {
			// default to report that models are NOT synced.
			// set to `true` to signal the model is synced.
			// `observeQuery()` should finish up after this returns `true`.
			getModelSyncedStatus: (model) => false,

			// not important for this testing. but unsubscribe calls this.
			// so, it needs to exist.
			unsubscribeConnectivity: () => {},
		};

		// how many items to accumulate before `observeQuery()` sends the items
		// to its subscriber.
		(DataStore as any).syncPageSize = 10;
	});

	test('publishes preexisting local data immediately', async (done) => {
		for (let i = 0; i < 5; i++) {
			await DataStore.save(
				new Post({
					title: `the post ${i}`,
				})
			);
		}

		const sub = DataStore.observeQuery(Post).subscribe(
			({ items, isSynced }) => {
				expect(items.length).toBe(5);
				expect(items[0].title).toEqual('the post 0');
				sub.unsubscribe();
				done();
			}
		);
	});

	test('publishes data saved after sync', async (done) => {
		const expecteds = [0, 10];

		const sub = DataStore.observeQuery(Post).subscribe(
			({ items, isSynced }) => {
				const expected = expecteds.shift();
				expect(items.length).toBe(expected);

				for (let i = 0; i < expected; i++) {
					expect(items[i].title).toEqual(`the post ${i}`);
				}

				if (expecteds.length === 0) {
					sub.unsubscribe();
					done();
				}
			}
		);

		setTimeout(async () => {
			for (let i = 0; i < 10; i++) {
				await DataStore.save(
					new Post({
						title: `the post ${i}`,
					})
				);
			}
		}, 100);
	});

	test('publishes preexisting local data AND follows up with subsequent saves', async (done) => {
		const expecteds = [5, 15];

		for (let i = 0; i < 5; i++) {
			await DataStore.save(
				new Post({
					title: `the post ${i}`,
				})
			);
		}

		const sub = DataStore.observeQuery(Post).subscribe(
			({ items, isSynced }) => {
				const expected = expecteds.shift();
				expect(items.length).toBe(expected);

				for (let i = 0; i < expected; i++) {
					expect(items[i].title).toEqual(`the post ${i}`);
				}

				if (expecteds.length === 0) {
					sub.unsubscribe();
					done();
				}
			}
		);

		setTimeout(async () => {
			for (let i = 5; i < 15; i++) {
				await DataStore.save(
					new Post({
						title: `the post ${i}`,
					})
				);
			}
		}, 100);
	});

	test('publishes received in pages data until isSynced', async (done) => {
		const expecteds = [5, 15, 22];

		for (let i = 0; i < 5; i++) {
			await DataStore.save(
				new Post({
					title: `the post ${i}`,
				})
			);
		}

		const sub = DataStore.observeQuery(Post).subscribe(
			({ items, isSynced }) => {
				const expected = expecteds.shift();
				expect(items.length).toBe(expected);

				for (let i = 0; i < expected; i++) {
					expect(items[i].title).toEqual(`the post ${i}`);
				}

				if (isSynced) {
					sub.unsubscribe();
					done();
				}
			}
		);

		setTimeout(async () => {
			for (let i = 5; i < 21; i++) {
				await DataStore.save(
					new Post({
						title: `the post ${i}`,
					})
				);
			}

			// to ensure isSynced changes after the first result set comes through
			// the subscription and BEFORE the last result, we use another timeout
			// to change the sync status and fire off the last save.
			setTimeout(async () => {
				(DataStore as any).sync.getModelSyncedStatus = (model) => true;
				await DataStore.save(
					new Post({
						title: `the post 21`,
					})
				);
			}, 100);
		}, 100);
	});

	test('publishes received records individually after isSynced', async (done) => {
		const expecteds = [5, 15, 16, 17, 18];

		for (let i = 0; i < 5; i++) {
			await DataStore.save(
				new Post({
					title: `the post ${i}`,
				})
			);
		}

		const sub = DataStore.observeQuery(Post).subscribe(
			({ items, isSynced }) => {
				const expected = expecteds.shift();
				expect(items.length).toBe(expected);

				for (let i = 0; i < expected; i++) {
					expect(items[i].title).toEqual(`the post ${i}`);
				}

				if (expecteds.length === 0) {
					sub.unsubscribe();
					done();
				}
			}
		);

		setTimeout(async () => {
			for (let i = 5; i < 15; i++) {
				await DataStore.save(
					new Post({
						title: `the post ${i}`,
					})
				);
			}

			// to ensure isSynced changes after the first result set comes through
			// the subscription and BEFORE the last result, we use another timeout
			// to change the sync status and fire off the last save.
			setTimeout(async () => {
				(DataStore as any).sync.getModelSyncedStatus = (model) => true;
				for (let i = 15; i < 18; i++) {
					await DataStore.save(
						new Post({
							title: `the post ${i}`,
						})
					);
				}
			}, 100);
		}, 100);
	});

	test('publishes preexisting local data AND follows up with subsequent saves with filters', async (done) => {
		const expecteds = [5, 15];

		for (let i = 0; i < 5; i++) {
			await DataStore.save(
				new Post({
					title: `the post ${i}`,
				})
			);
			await DataStore.save(
				new Post({
					title: `NOT the post ${i}`,
				})
			);
		}

		const sub = DataStore.observeQuery(Post, (p) =>
			p.title.beginsWith('the post')
		).subscribe(({ items, isSynced }) => {
			const expected = expecteds.shift();
			expect(items.length).toBe(expected);

			for (let i = 0; i < expected; i++) {
				expect(items[i].title).toEqual(`the post ${i}`);
			}

			if (expecteds.length === 0) {
				sub.unsubscribe();
				done();
			}
		});

		setTimeout(async () => {
			for (let i = 5; i < 15; i++) {
				await DataStore.save(
					new Post({
						title: `the post ${i}`,
					})
				);
				await DataStore.save(
					new Post({
						title: `NOT the post ${i}`,
					})
				);
			}
		}, 100);
	});
});

describe('DataStore tests', () => {
	beforeEach(() => {
		jest.resetModules();

		jest.doMock('../src/storage/storage', () => {
			const mock = jest.fn().mockImplementation(() => ({
				init: jest.fn(),
				runExclusive: jest.fn(),
				query: jest.fn(() => []),
				save: jest.fn(() => []),
				observe: jest.fn(() => Observable.of()),
			}));

			(<any>mock).getNamespace = () => ({ models: {} });

			return { ExclusiveStorage: mock };
		});
		({ initSchema, DataStore } = require('../src/datastore/datastore'));
	});

	describe('initSchema tests', () => {
		test('Model class is created', () => {
			const classes = initSchema(testSchema());

			expect(classes).toHaveProperty('Model');

			const { Model } = classes as { Model: PersistentModelConstructor<Model> };

			expect(Model).toHaveProperty(
				nameOf<PersistentModelConstructor<any>>('copyOf')
			);

			expect(typeof Model.copyOf).toBe('function');
		});

		test('Model class can be instantiated', () => {
			const { Model } = initSchema(testSchema()) as {
				Model: PersistentModelConstructor<Model>;
			};

			const model = new Model({
				field1: 'something',
				dateCreated: new Date().toISOString(),
			});

			expect(model).toBeInstanceOf(Model);

			expect(model.id).toBeDefined();

			// syncable models use uuid v4
			expect(uuidValidate(model.id, 4)).toBe(true);
		});

		test('Non-syncable models get a ulid', () => {
			const { LocalModel } = initSchema(testSchema()) as {
				LocalModel: PersistentModelConstructor<Model>;
			};

			const now = Date.now();
			const model = new LocalModel({
				field1: 'something',
				dateCreated: new Date().toISOString(),
			});

			expect(model).toBeInstanceOf(LocalModel);

			expect(model.id).toBeDefined();

			const decodedTime = decodeTime(model.id);

			const diff = Math.abs(decodedTime - now);

			expect(diff).toBeLessThan(1000);
		});

		test('initSchema is executed only once', () => {
			initSchema(testSchema());

			const spy = jest.spyOn(console, 'warn');

			expect(() => {
				initSchema(testSchema());
			}).not.toThrow();

			expect(spy).toBeCalledWith('The schema has already been initialized');
		});

		test('Non @model class is created', () => {
			const classes = initSchema(testSchema());

			expect(classes).toHaveProperty('Metadata');

			const { Metadata } = classes;

			expect(Metadata).not.toHaveProperty(
				nameOf<PersistentModelConstructor<any>>('copyOf')
			);
		});

		test('Non @model class can be instantiated', () => {
			const { Metadata } = initSchema(testSchema()) as {
				Metadata: NonModelTypeConstructor<Metadata>;
			};

			const metadata = new Metadata({
				author: 'some author',
				tags: [],
				rewards: [],
				penNames: [],
				nominations: [],
			});

			expect(metadata).toBeInstanceOf(Metadata);

			expect(metadata).not.toHaveProperty('id');
		});
	});

	describe('Immutability', () => {
		test('Field cannot be changed', () => {
			const { Model } = initSchema(testSchema()) as {
				Model: PersistentModelConstructor<Model>;
			};

			const model = new Model({
				field1: 'something',
				dateCreated: new Date().toISOString(),
			});

			expect(() => {
				(<any>model).field1 = 'edit';
			}).toThrowError("Cannot assign to read only property 'field1' of object");
		});

		test('Model can be copied+edited by creating an edited copy', () => {
			const { Model } = initSchema(testSchema()) as {
				Model: PersistentModelConstructor<Model>;
			};

			const model1 = new Model({
				field1: 'something',
				dateCreated: new Date().toISOString(),
			});

			const model2 = Model.copyOf(model1, (draft) => {
				draft.field1 = 'edited';
			});

			expect(model1).not.toBe(model2);

			// ID should be kept the same
			expect(model1.id).toBe(model2.id);

			expect(model1.field1).toBe('something');
			expect(model2.field1).toBe('edited');
		});

		test('Id cannot be changed inside copyOf', () => {
			const { Model } = initSchema(testSchema()) as {
				Model: PersistentModelConstructor<Model>;
			};

			const model1 = new Model({
				field1: 'something',
				dateCreated: new Date().toISOString(),
			});

			const model2 = Model.copyOf(model1, (draft) => {
				(<any>draft).id = 'a-new-id';
			});

			// ID should be kept the same
			expect(model1.id).toBe(model2.id);
		});

		test('Optional field can be initialized with undefined', () => {
			const { Model } = initSchema(testSchema()) as {
				Model: PersistentModelConstructor<Model>;
			};

			const model1 = new Model({
				field1: 'something',
				dateCreated: new Date().toISOString(),
				optionalField1: undefined,
			});

			expect(model1.optionalField1).toBeUndefined();
		});

		test('Optional field can be initialized with null', () => {
			const { Model } = initSchema(testSchema()) as {
				Model: PersistentModelConstructor<Model>;
			};

			const model1 = new Model({
				field1: 'something',
				dateCreated: new Date().toISOString(),
				optionalField1: null,
			});

			expect(model1.optionalField1).toBeNull();
		});

		test('Optional field can be changed to undefined inside copyOf', () => {
			const { Model } = initSchema(testSchema()) as {
				Model: PersistentModelConstructor<Model>;
			};

			const model1 = new Model({
				field1: 'something',
				dateCreated: new Date().toISOString(),
				optionalField1: 'something-else',
			});

			const model2 = Model.copyOf(model1, (draft) => {
				(<any>draft).optionalField1 = undefined;
			});

			// ID should be kept the same
			expect(model1.id).toBe(model2.id);

			expect(model1.optionalField1).toBe('something-else');
			expect(model2.optionalField1).toBeUndefined();
		});

		test('Optional field can be set to null inside copyOf', () => {
			const { Model } = initSchema(testSchema()) as {
				Model: PersistentModelConstructor<Model>;
			};

			const model1 = new Model({
				field1: 'something',
				dateCreated: new Date().toISOString(),
			});

			const model2 = Model.copyOf(model1, (draft) => {
				(<any>draft).optionalField1 = null;
			});

			// ID should be kept the same
			expect(model1.id).toBe(model2.id);

			expect(model1.optionalField1).toBeUndefined();
			expect(model2.optionalField1).toBeNull();
		});

		test('Non @model - Field cannot be changed', () => {
			const { Metadata } = initSchema(testSchema()) as {
				Metadata: NonModelTypeConstructor<Metadata>;
			};

			const nonModel = new Metadata({
				author: 'something',
				rewards: [],
				penNames: [],
				nominations: [],
			});

			expect(() => {
				(<any>nonModel).author = 'edit';
			}).toThrowError("Cannot assign to read only property 'author' of object");
		});
	});

	describe('Initialization', () => {
		test('start is called only once', async () => {
			const storage: StorageType =
				require('../src/storage/storage').ExclusiveStorage;

			const classes = initSchema(testSchema());

			const { Model } = classes as { Model: PersistentModelConstructor<Model> };

			const promises = [
				DataStore.query(Model),
				DataStore.query(Model),
				DataStore.query(Model),
				DataStore.query(Model),
			];

			await Promise.all(promises);

			expect(storage).toHaveBeenCalledTimes(1);
		});

		test('It is initialized when observing (no query)', async () => {
			const storage: StorageType =
				require('../src/storage/storage').ExclusiveStorage;

			const classes = initSchema(testSchema());

			const { Model } = classes as { Model: PersistentModelConstructor<Model> };

			DataStore.observe(Model).subscribe(jest.fn());

			expect(storage).toHaveBeenCalledTimes(1);
		});
	});

	describe('Basic operations', () => {
		let Model: PersistentModelConstructor<Model>;
		let Metadata: NonModelTypeConstructor<Metadata>;

		beforeEach(() => {
			jest.resetModules();
			jest.doMock('../src/storage/storage', () => {
				const mock = jest.fn().mockImplementation(() => ({
					init: jest.fn(),
					runExclusive: jest.fn(() => []),
					query: jest.fn(() => []),
					observe: jest.fn(() => Observable.from([])),
				}));

				(<any>mock).getNamespace = () => ({ models: {} });

				return { ExclusiveStorage: mock };
			});
			({ initSchema, DataStore } = require('../src/datastore/datastore'));

			const classes = initSchema(testSchema());

			({ Model, Metadata } = classes as {
				Model: PersistentModelConstructor<Model>;
				Metadata: NonModelTypeConstructor<Metadata>;
			});
		});

		test('Save returns the saved model', async () => {
			let model: Model;
			const save = jest.fn(() => [model]);
			const query = jest.fn(() => [model]);

			jest.resetModules();
			jest.doMock('../src/storage/storage', () => {
				const mock = jest.fn().mockImplementation(() => {
					const _mock = {
						init: jest.fn(),
						save,
						query,
						runExclusive: jest.fn((fn) => fn.bind(this, _mock)()),
					};

					return _mock;
				});

				(<any>mock).getNamespace = () => ({ models: {} });

				return { ExclusiveStorage: mock };
			});

			({ initSchema, DataStore } = require('../src/datastore/datastore'));

			const classes = initSchema(testSchema());

			const { Model } = classes as { Model: PersistentModelConstructor<Model> };

			model = new Model({
				field1: 'Some value',
				dateCreated: new Date().toISOString(),
			});

			const result = await DataStore.save(model);

			const [settingsSave, modelCall] = <any>save.mock.calls;
			const [_model, _condition, _mutator, patches] = modelCall;

			expect(result).toMatchObject(model);
			expect(patches).toBeUndefined();
		});

		test('Save returns the updated model and patches', async () => {
			let model: Model;
			const save = jest.fn(() => [model]);
			const query = jest.fn(() => [model]);

			jest.resetModules();
			jest.doMock('../src/storage/storage', () => {
				const mock = jest.fn().mockImplementation(() => {
					const _mock = {
						init: jest.fn(),
						save,
						query,
						runExclusive: jest.fn((fn) => fn.bind(this, _mock)()),
					};

					return _mock;
				});

				(<any>mock).getNamespace = () => ({ models: {} });

				return { ExclusiveStorage: mock };
			});

			({ initSchema, DataStore } = require('../src/datastore/datastore'));

			const classes = initSchema(testSchema());

			const { Model } = classes as { Model: PersistentModelConstructor<Model> };

			model = new Model({
				field1: 'something',
				dateCreated: new Date().toISOString(),
			});

			await DataStore.save(model);

			model = Model.copyOf(model, (draft) => {
				draft.field1 = 'edited';
			});

			const result = await DataStore.save(model);

			const [settingsSave, modelSave, modelUpdate] = <any>save.mock.calls;
			const [_model, _condition, _mutator, [patches]] = modelUpdate;

			const expectedPatches = [
				{ op: 'replace', path: ['field1'], value: 'edited' },
			];

			expect(result).toMatchObject(model);
			expect(patches).toMatchObject(expectedPatches);
		});

		test('Save returns the updated model and patches - list field', async () => {
			let model: Model;
			const save = jest.fn(() => [model]);
			const query = jest.fn(() => [model]);

			jest.resetModules();
			jest.doMock('../src/storage/storage', () => {
				const mock = jest.fn().mockImplementation(() => {
					const _mock = {
						init: jest.fn(),
						save,
						query,
						runExclusive: jest.fn((fn) => fn.bind(this, _mock)()),
					};

					return _mock;
				});

				(<any>mock).getNamespace = () => ({ models: {} });

				return { ExclusiveStorage: mock };
			});

			({ initSchema, DataStore } = require('../src/datastore/datastore'));

			const classes = initSchema(testSchema());

			const { Model } = classes as { Model: PersistentModelConstructor<Model> };

			model = new Model({
				field1: 'something',
				dateCreated: new Date().toISOString(),
				emails: ['john@doe.com', 'jane@doe.com'],
			});

			await DataStore.save(model);

			model = Model.copyOf(model, (draft) => {
				draft.emails = [...draft.emails, 'joe@doe.com'];
			});

			let result = await DataStore.save(model);

			expect(result).toMatchObject(model);

			model = Model.copyOf(model, (draft) => {
				draft.emails.push('joe@doe.com');
			});

			result = await DataStore.save(model);

			expect(result).toMatchObject(model);

			const [settingsSave, modelSave, modelUpdate, modelUpdate2] = <any>(
				save.mock.calls
			);

			const [_model, _condition, _mutator, [patches]] = modelUpdate;
			const [_model2, _condition2, _mutator2, [patches2]] = modelUpdate2;

			const expectedPatches = [
				{
					op: 'replace',
					path: ['emails'],
					value: ['john@doe.com', 'jane@doe.com', 'joe@doe.com'],
				},
			];

			const expectedPatches2 = [
				{
					op: 'add',
					path: ['emails', 3],
					value: 'joe@doe.com',
				},
			];

			expect(patches).toMatchObject(expectedPatches);
			expect(patches2).toMatchObject(expectedPatches2);
		});

		test('Read-only fields cannot be overwritten', async () => {
			let model: Model;
			const save = jest.fn(() => [model]);
			const query = jest.fn(() => [model]);

			jest.resetModules();
			jest.doMock('../src/storage/storage', () => {
				const mock = jest.fn().mockImplementation(() => {
					const _mock = {
						init: jest.fn(),
						save,
						query,
						runExclusive: jest.fn((fn) => fn.bind(this, _mock)()),
					};

					return _mock;
				});

				(<any>mock).getNamespace = () => ({ models: {} });

				return { ExclusiveStorage: mock };
			});

			({ initSchema, DataStore } = require('../src/datastore/datastore'));

			const classes = initSchema(testSchema());

			const { Model } = classes as { Model: PersistentModelConstructor<Model> };

			expect(() => {
				new Model({
					field1: 'something',
					dateCreated: new Date().toISOString(),
					createdAt: '2021-06-03T20:56:23.201Z',
				} as any);
			}).toThrow('createdAt is read-only.');

			model = new Model({
				field1: 'something',
				dateCreated: new Date().toISOString(),
			});

			expect(() => {
				Model.copyOf(model, (draft) => {
					(draft as any).createdAt = '2021-06-03T20:56:23.201Z';
				});
			}).toThrow('createdAt is read-only.');

			expect(() => {
				Model.copyOf(model, (draft) => {
					(draft as any).updatedAt = '2021-06-03T20:56:23.201Z';
				});
			}).toThrow('updatedAt is read-only.');
		});

		test('Instantiation validations', async () => {
			expect(() => {
				new Model({
					field1: undefined,
					dateCreated: new Date().toISOString(),
				});
			}).toThrowError('Field field1 is required');

			expect(() => {
				new Model({
					field1: null,
					dateCreated: new Date().toISOString(),
				});
			}).toThrowError('Field field1 is required');

			expect(() => {
				new Model({
					field1: <any>1234,
					dateCreated: new Date().toISOString(),
				});
			}).toThrowError(
				'Field field1 should be of type string, number received. 1234'
			);

			expect(() => {
				new Model({
					field1: 'someField',
					dateCreated: 'not-a-date',
				});
			}).toThrowError(
				'Field dateCreated should be of type AWSDateTime, validation failed. not-a-date'
			);

			expect(
				new Model({
					field1: 'someField',
					dateCreated: new Date().toISOString(),
					metadata: new Metadata({
						author: 'Some author',
						tags: undefined,
						rewards: [],
						penNames: [],
						nominations: [],
					}),
				}).metadata.tags
			).toBeUndefined();

			expect(() => {
				new Model({
					field1: 'someField',
					dateCreated: new Date().toISOString(),
					metadata: new Metadata({
						author: 'Some author',
						tags: undefined,
						rewards: [null],
						penNames: [],
						nominations: [],
					}),
				});
			}).toThrowError(
				'All elements in the rewards array should be of type string, [null] received. '
			);

			expect(() => {
				new Model({
					field1: 'someField',
					dateCreated: new Date().toISOString(),
					emails: null,
					ips: null,
				});
			}).not.toThrow();

			expect(() => {
				new Model({
					field1: 'someField',
					dateCreated: new Date().toISOString(),
					emails: [null],
				});
			}).toThrowError(
				'All elements in the emails array should be of type string, [null] received. '
			);

			expect(() => {
				new Model({
					field1: 'someField',
					dateCreated: new Date().toISOString(),
					ips: [null],
				});
			}).not.toThrow();

			expect(() => {
				new Model({
					field1: 'someField',
					dateCreated: new Date().toISOString(),
					ips: ['1.1.1.1'],
				});
			}).not.toThrow();

			expect(() => {
				new Model({
					field1: 'someField',
					dateCreated: new Date().toISOString(),
					ips: ['not.an.ip'],
				});
			}).toThrowError(
				`All elements in the ips array should be of type AWSIPAddress, validation failed for one or more elements. not.an.ip`
			);

			expect(() => {
				new Model({
					field1: 'someField',
					dateCreated: new Date().toISOString(),
					ips: ['1.1.1.1', 'not.an.ip'],
				});
			}).toThrowError(
				`All elements in the ips array should be of type AWSIPAddress, validation failed for one or more elements. 1.1.1.1,not.an.ip`
			);

			expect(() => {
				new Model({
					field1: 'someField',
					dateCreated: new Date().toISOString(),
					emails: ['test@example.com'],
				});
			}).not.toThrow();

			expect(() => {
				new Model({
					field1: 'someField',
					dateCreated: new Date().toISOString(),
					emails: [],
					ips: [],
				});
			}).not.toThrow();

			expect(() => {
				new Model({
					field1: 'someField',
					dateCreated: new Date().toISOString(),
					emails: ['not-an-email'],
				});
			}).toThrowError(
				'All elements in the emails array should be of type AWSEmail, validation failed for one or more elements. not-an-email'
			);

			expect(() => {
				new Model({
					field1: 'someField',
					dateCreated: new Date().toISOString(),
					ips: ['not-an-ip'],
				});
			}).toThrowError(
				'All elements in the ips array should be of type AWSIPAddress, validation failed for one or more elements. not-an-ip'
			);

			expect(() => {
				new Model({
					field1: 'someField',
					dateCreated: new Date().toISOString(),
					metadata: new Metadata({
						author: 'Some author',
						tags: undefined,
						rewards: [],
						penNames: [],
						nominations: null,
					}),
				});
			}).toThrowError('Field nominations is required');

			expect(() => {
				new Model({
					field1: 'someField',
					dateCreated: new Date().toISOString(),
					metadata: new Metadata({
						author: 'Some author',
						tags: undefined,
						rewards: [],
						penNames: [undefined],
						nominations: [],
					}),
				});
			}).toThrowError(
				'All elements in the penNames array should be of type string, [undefined] received. '
			);

			expect(() => {
				new Model({
					field1: 'someField',
					dateCreated: new Date().toISOString(),
					metadata: new Metadata({
						author: 'Some author',
						tags: [<any>1234],
						rewards: [],
						penNames: [],
						nominations: [],
					}),
				});
			}).toThrowError(
				'All elements in the tags array should be of type string | null | undefined, [number] received. 1234'
			);

			expect(() => {
				new Model({
					field1: 'someField',
					dateCreated: new Date().toISOString(),
					metadata: new Metadata({
						author: 'Some author',
						rewards: [],
						penNames: [],
						nominations: [],
						misc: [null],
					}),
				});
			}).not.toThrow();

			expect(() => {
				new Model({
					field1: 'someField',
					dateCreated: new Date().toISOString(),
					metadata: new Metadata({
						author: 'Some author',
						rewards: [],
						penNames: [],
						nominations: [],
						misc: [undefined],
					}),
				});
			}).not.toThrow();

			expect(() => {
				new Model({
					field1: 'someField',
					dateCreated: new Date().toISOString(),
					metadata: new Metadata({
						author: 'Some author',
						rewards: [],
						penNames: [],
						nominations: [],
						misc: [undefined, null],
					}),
				});
			}).not.toThrow();

			expect(() => {
				new Model({
					field1: 'someField',
					dateCreated: new Date().toISOString(),
					metadata: new Metadata({
						author: 'Some author',
						rewards: [],
						penNames: [],
						nominations: [],
						misc: [null, 'ok'],
					}),
				});
			}).not.toThrow();

			expect(() => {
				new Model({
					field1: 'someField',
					dateCreated: new Date().toISOString(),
					metadata: new Metadata({
						author: 'Some author',
						rewards: [],
						penNames: [],
						nominations: [],
						misc: [null, <any>123],
					}),
				});
			}).toThrowError(
				'All elements in the misc array should be of type string | null | undefined, [null,number] received. ,123'
			);

			expect(
				new Model(<any>{ extraAttribute: 'some value', field1: 'some value' })
			).toHaveProperty('extraAttribute');

			expect(() => {
				Model.copyOf(<any>undefined, (d) => d);
			}).toThrow('The source object is not a valid model');
			expect(() => {
				const source = new Model({
					field1: 'something',
					dateCreated: new Date().toISOString(),
				});
				Model.copyOf(source, (d) => (d.field1 = <any>1234));
			}).toThrow(
				'Field field1 should be of type string, number received. 1234'
			);
		});

		test('Delete params', async () => {
			await expect(DataStore.delete(<any>undefined)).rejects.toThrow(
				'Model or Model Constructor required'
			);

			await expect(DataStore.delete(<any>Model)).rejects.toThrow(
				'Id to delete or criteria required. Do you want to delete all? Pass Predicates.ALL'
			);

			await expect(DataStore.delete(Model, <any>(() => {}))).rejects.toThrow(
				'Criteria required. Do you want to delete all? Pass Predicates.ALL'
			);

			await expect(DataStore.delete(Model, <any>(() => {}))).rejects.toThrow(
				'Criteria required. Do you want to delete all? Pass Predicates.ALL'
			);

			await expect(DataStore.delete(<any>{})).rejects.toThrow(
				'Object is not an instance of a valid model'
			);

			await expect(
				DataStore.delete(
					new Model({
						field1: 'somevalue',
						dateCreated: new Date().toISOString(),
					}),
					<any>{}
				)
			).rejects.toThrow('Invalid criteria');
		});

		test('Delete many returns many', async () => {
			const models: Model[] = [];
			const save = jest.fn((model) => {
				model instanceof Model && models.push(model);
			});
			const query = jest.fn(() => models);
			const _delete = jest.fn(() => [models, models]);

			jest.resetModules();
			jest.doMock('../src/storage/storage', () => {
				const mock = jest.fn().mockImplementation(() => {
					const _mock = {
						init: jest.fn(),
						save,
						query,
						delete: _delete,
						runExclusive: jest.fn((fn) => fn.bind(this, _mock)()),
					};

					return _mock;
				});

				(<any>mock).getNamespace = () => ({ models: {} });

				return { ExclusiveStorage: mock };
			});

			({ initSchema, DataStore } = require('../src/datastore/datastore'));

			const classes = initSchema(testSchema());

			const { Model } = classes as {
				Model: PersistentModelConstructor<Model>;
			};

			for (let i = 0; i < 10; i++) {
				await DataStore.save(
					new Model({
						field1: 'someField',
						dateCreated: new Date().toISOString(),
						metadata: new Metadata({
							author: 'Some author ' + i,
							rewards: [],
							penNames: [],
							nominations: [],
							misc: [null, 'ok'],
						}),
					})
				);
			}

			const deleted = await DataStore.delete(Model, (m) =>
				m.field1('eq', 'someField')
			);

			expect(deleted.length).toEqual(10);
			deleted.forEach((deletedItem) => {
				expect(deletedItem.field1).toEqual('someField');
			});
		});

		test('Delete one returns one', async () => {
			let model: Model;
			const save = jest.fn((saved) => (model = saved));
			const query = jest.fn(() => [model]);
			const _delete = jest.fn(() => [[model], [model]]);

			jest.resetModules();
			jest.doMock('../src/storage/storage', () => {
				const mock = jest.fn().mockImplementation(() => {
					const _mock = {
						init: jest.fn(),
						save,
						query,
						delete: _delete,
						runExclusive: jest.fn((fn) => fn.bind(this, _mock)()),
					};
					return _mock;
				});

				(<any>mock).getNamespace = () => ({ models: {} });

				return { ExclusiveStorage: mock };
			});

			({ initSchema, DataStore } = require('../src/datastore/datastore'));

			const classes = initSchema(testSchema());

			const { Model } = classes as {
				Model: PersistentModelConstructor<Model>;
			};

			const saved = await DataStore.save(
				new Model({
					field1: 'someField',
					dateCreated: new Date().toISOString(),
					metadata: new Metadata({
						author: 'Some author',
						rewards: [],
						penNames: [],
						nominations: [],
						misc: [null, 'ok'],
					}),
				})
			);

			const deleted: Model[] = await DataStore.delete(Model, saved.id);

			expect(deleted.length).toEqual(1);
			expect(deleted[0]).toEqual(model);
		});

		test('Query params', async () => {
			await expect(DataStore.query(<any>undefined)).rejects.toThrow(
				'Constructor is not for a valid model'
			);

			await expect(DataStore.query(<any>undefined)).rejects.toThrow(
				'Constructor is not for a valid model'
			);

			await expect(
				DataStore.query(Model, <any>'someid', { page: 0 })
			).rejects.toThrow('Limit is required when requesting a page');

			await expect(
				DataStore.query(Model, <any>'someid', { page: <any>'a', limit: 10 })
			).rejects.toThrow('Page should be a number');

			await expect(
				DataStore.query(Model, <any>'someid', { page: -1, limit: 10 })
			).rejects.toThrow("Page can't be negative");

			await expect(
				DataStore.query(Model, <any>'someid', { page: 0, limit: <any>'avalue' })
			).rejects.toThrow('Limit should be a number');

			await expect(
				DataStore.query(Model, <any>'someid', { page: 0, limit: -1 })
			).rejects.toThrow("Limit can't be negative");
		});
	});

	test("non-@models can't be saved", async () => {
		const { Metadata } = initSchema(testSchema()) as {
			Metadata: NonModelTypeConstructor<Metadata>;
		};

		const metadata = new Metadata({
			author: 'some author',
			tags: [],
			rewards: [],
			penNames: [],
			nominations: [],
		});

		await expect(DataStore.save(<any>metadata)).rejects.toThrow(
			'Object is not an instance of a valid model'
		);
	});

	describe('Type definitions', () => {
		let Model: PersistentModelConstructor<Model>;

		beforeEach(() => {
			let model: Model;

			jest.resetModules();
			jest.doMock('../src/storage/storage', () => {
				const mock = jest.fn().mockImplementation(() => ({
					init: jest.fn(),
					runExclusive: jest.fn(() => [model]),
					query: jest.fn(() => [model]),
					observe: jest.fn(() => Observable.from([])),
				}));

				(<any>mock).getNamespace = () => ({ models: {} });

				return { ExclusiveStorage: mock };
			});
			({ initSchema, DataStore } = require('../src/datastore/datastore'));

			const classes = initSchema(testSchema());

			({ Model } = classes as { Model: PersistentModelConstructor<Model> });

			model = new Model({
				field1: 'Some value',
				dateCreated: new Date().toISOString(),
			});
		});

		describe('Query', () => {
			test('all', async () => {
				const allModels = await DataStore.query(Model);
				expectType<Model[]>(allModels);
				const [one] = allModels;
				expect(one.field1).toBeDefined();
				expect(one).toBeInstanceOf(Model);
			});
			test('one by id', async () => {
				const oneModelById = await DataStore.query(Model, 'someid');
				expectType<Model>(oneModelById);
				expect(oneModelById.field1).toBeDefined();
				expect(oneModelById).toBeInstanceOf(Model);
			});
			test('with criteria', async () => {
				const multiModelWithCriteria = await DataStore.query(Model, (c) =>
					c.field1.contains('something')
				);
				expectType<Model[]>(multiModelWithCriteria);
				const [one] = multiModelWithCriteria;
				expect(one.field1).toBeDefined();
				expect(one).toBeInstanceOf(Model);
			});
			test('with identity function criteria', async () => {
				const multiModelWithCriteria = await DataStore.query(Model, (c) => c);
				expectType<Model[]>(multiModelWithCriteria);
				const [one] = multiModelWithCriteria;
				expect(one.field1).toBeDefined();
				expect(one).toBeInstanceOf(Model);
			});
			test('with pagination', async () => {
				const allModelsPaginated = await DataStore.query(
					Model,
					Predicates.ALL,
					{ page: 0, limit: 20 }
				);
				expectType<Model[]>(allModelsPaginated);
				const [one] = allModelsPaginated;
				expect(one.field1).toBeDefined();
				expect(one).toBeInstanceOf(Model);
			});
		});

		describe('Query with generic type', () => {
			test('all', async () => {
				const allModels = await DataStore.query<Model>(Model);
				expectType<Model[]>(allModels);
				const [one] = allModels;
				expect(one.field1).toBeDefined();
				expect(one).toBeInstanceOf(Model);
			});
			test('one by id', async () => {
				const oneModelById = await DataStore.query<Model>(Model, 'someid');
				expectType<Model>(oneModelById);
				expect(oneModelById.field1).toBeDefined();
				expect(oneModelById).toBeInstanceOf(Model);
			});
			test('with criteria', async () => {
				const multiModelWithCriteria = await DataStore.query<Model>(
					Model,
					(c) => c.field1.contains('something')
				);
				expectType<Model[]>(multiModelWithCriteria);
				const [one] = multiModelWithCriteria;
				expect(one.field1).toBeDefined();
				expect(one).toBeInstanceOf(Model);
			});
			test('with pagination', async () => {
				const allModelsPaginated = await DataStore.query<Model>(
					Model,
					Predicates.ALL,
					{ page: 0, limit: 20 }
				);
				expectType<Model[]>(allModelsPaginated);
				const [one] = allModelsPaginated;
				expect(one.field1).toBeDefined();
				expect(one).toBeInstanceOf(Model);
			});
		});

		describe('Observe', () => {
			test('subscribe to all models', async () => {
				DataStore.observe().subscribe(({ element, model }) => {
					expectType<PersistentModelConstructor<PersistentModel>>(model);
					expectType<PersistentModel>(element);
				});
			});
			test('subscribe to model instance', async () => {
				const model = new Model({
					field1: 'somevalue',
					dateCreated: new Date().toISOString(),
				});

				DataStore.observe(model).subscribe(({ element, model }) => {
					expectType<PersistentModelConstructor<Model>>(model);
					expectType<Model>(element);
				});
			});
			test('subscribe to model', async () => {
				DataStore.observe(Model).subscribe(({ element, model }) => {
					expectType<PersistentModelConstructor<Model>>(model);
					expectType<Model>(element);
				});
			});
			test('subscribe to model instance by id', async () => {
				DataStore.observe(Model, 'some id').subscribe(({ element, model }) => {
					expectType<PersistentModelConstructor<Model>>(model);
					expectType<Model>(element);
				});
			});
			test('subscribe to model with criteria', async () => {
				DataStore.observe(Model, (c) => c.field1.ne('somevalue')).subscribe(
					({ element, model }) => {
						expectType<PersistentModelConstructor<Model>>(model);
						expectType<Model>(element);
					}
				);
			});
		});

		describe('Observe with generic type', () => {
			test('subscribe to model instance', async () => {
				const model = new Model({
					field1: 'somevalue',
					dateCreated: new Date().toISOString(),
				});

				DataStore.observe<Model>(model).subscribe(({ element, model }) => {
					expectType<PersistentModelConstructor<Model>>(model);
					expectType<Model>(element);
				});
			});
			test('subscribe to model', async () => {
				DataStore.observe<Model>(Model).subscribe(({ element, model }) => {
					expectType<PersistentModelConstructor<Model>>(model);
					expectType<Model>(element);
				});
			});
			test('subscribe to model instance by id', async () => {
				DataStore.observe<Model>(Model, 'some id').subscribe(
					({ element, model }) => {
						expectType<PersistentModelConstructor<Model>>(model);
						expectType<Model>(element);
					}
				);
			});
			test('subscribe to model with criteria', async () => {
				DataStore.observe<Model>(Model, (c) =>
					c.field1.ne('somevalue')
				).subscribe(({ element, model }) => {
					expectType<PersistentModelConstructor<Model>>(model);
					expectType<Model>(element);
				});
			});
		});
	});
});
