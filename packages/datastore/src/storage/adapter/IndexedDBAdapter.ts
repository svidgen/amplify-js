import { ConsoleLogger as Logger } from '@aws-amplify/core';
import * as idb from 'idb';
import { ModelInstanceCreator } from '../../datastore/datastore';
import { ModelPredicateCreator } from '../../predicates';
import {
	InternalSchema,
	isPredicateObj,
	isPredicateGroup,
	ModelInstanceMetadata,
	ModelPredicate,
	NamespaceResolver,
	OpType,
	PaginationInput,
	PersistentModel,
	PersistentModelConstructor,
	PredicateObject,
	PredicatesGroup,
	QueryOne,
	RelationType,
} from '../../types';
import {
	getIndex,
	getIndexFromAssociation,
	isModelConstructor,
	isPrivateMode,
	traverseModel,
	validatePredicate,
	inMemoryPagination,
	NAMESPACES,
} from '../../util';
import { Adapter } from './index';

const logger = new Logger('DataStore');

const DB_NAME = 'amplify-datastore';

class IndexedDBAdapter implements Adapter {
	private schema!: InternalSchema;
	private namespaceResolver!: NamespaceResolver;
	private modelInstanceCreator!: ModelInstanceCreator;
	private getModelConstructorByModelName?: (
		namsespaceName: NAMESPACES,
		modelName: string
	) => PersistentModelConstructor<any>;
	private db!: idb.IDBPDatabase;
	private initPromise!: Promise<void>;
	private resolve!: (value?: any) => void;
	private reject!: (value?: any) => void;
	private dbName: string = DB_NAME;

	private async checkPrivate() {
		const isPrivate = await isPrivateMode().then(isPrivate => {
			return isPrivate;
		});
		if (isPrivate) {
			logger.error("IndexedDB not supported in this browser's private mode");
			return Promise.reject(
				"IndexedDB not supported in this browser's private mode"
			);
		} else {
			return Promise.resolve();
		}
	}

	private getStorenameForModel(
		modelConstructor: PersistentModelConstructor<any>
	) {
		const namespace = this.namespaceResolver(modelConstructor);
		const { name: modelName } = modelConstructor;

		return this.getStorename(namespace, modelName);
	}

	private getStorename(namespace: string, modelName: string) {
		const storeName = `${namespace}_${modelName}`;

		return storeName;
	}

	async setUp(
		theSchema: InternalSchema,
		namespaceResolver: NamespaceResolver,
		modelInstanceCreator: ModelInstanceCreator,
		getModelConstructorByModelName: (
			namsespaceName: NAMESPACES,
			modelName: string
		) => PersistentModelConstructor<any>,
		sessionId?: string
	) {
		await this.checkPrivate();
		if (!this.initPromise) {
			this.initPromise = new Promise((res, rej) => {
				this.resolve = res;
				this.reject = rej;
			});
		} else {
			await this.initPromise;
		}
		if (sessionId) {
			this.dbName = `${DB_NAME}-${sessionId}`;
		}
		this.schema = theSchema;
		this.namespaceResolver = namespaceResolver;
		this.modelInstanceCreator = modelInstanceCreator;
		this.getModelConstructorByModelName = getModelConstructorByModelName;

		try {
			if (!this.db) {
				// Should we consider mapping a `DBSchema` type to give to openDB<T>() so we can
				// limit the number of type casts and/or any's, and/or guards later?
				// See https://github.com/jakearchibald/idb#typescript
				const VERSION = 2;
				this.db = await idb.openDB(this.dbName, VERSION, {
					upgrade: async (db, oldVersion, newVersion, txn) => {
						if (oldVersion === 0) {
							Object.keys(theSchema.namespaces).forEach(namespaceName => {
								const namespace = theSchema.namespaces[namespaceName];

								Object.keys(namespace.models).forEach(modelName => {
									const storeName = this.getStorename(namespaceName, modelName);
									const store = db.createObjectStore(storeName, {
										autoIncrement: true,
									});

									const indexes =
										this.schema?.namespaces?.[namespaceName]?.relationships?.[
											modelName
										].indexes || [];
									indexes.forEach(index => store.createIndex(index, index));

									store.createIndex('byId', 'id', { unique: true });
								});
							});

							return;
						}

						if (oldVersion === 1 && newVersion === 2) {
							try {
								for (const storeName of txn.objectStoreNames) {
									const origStore = txn.objectStore(storeName);

									// rename original store
									const tmpName = `tmp_${storeName}`;
									origStore.name = tmpName;

									// create new store with original name
									const newStore = db.createObjectStore(storeName, {
										keyPath: undefined,
										autoIncrement: true,
									});

									newStore.createIndex('byId', 'id', { unique: true });

									let cursor = await origStore.openCursor();
									let count = 0;

									// Copy data from original to new
									while (cursor && cursor.value) {
										// we don't pass key, since they are all new entries in the new store
										await newStore.put(cursor.value);

										cursor = await cursor.continue();
										count++;
									}

									// delete original
									db.deleteObjectStore(tmpName);

									logger.debug(`${count} ${storeName} records migrated`);
								}
							} catch (error) {
								logger.error('Error migrating IndexedDB data', error);
								txn.abort();
								throw error;
							}

							return;
						}
					},
				});

				this.resolve();
			}
		} catch (error) {
			this.reject(error);
		}
	}

	private async _get<T>(
		storeOrStoreName: idb.IDBPObjectStore | string,
		id: string
	): Promise<T> {
		let index: idb.IDBPIndex;

		if (typeof storeOrStoreName === 'string') {
			const storeName = storeOrStoreName;
			index = this.db.transaction(storeName, 'readonly').store.index('byId');
		} else {
			const store = storeOrStoreName;
			index = store.index('byId');
		}

		return await index.get(id);
	}

	async save<T extends PersistentModel>(
		model: T,
		condition?: ModelPredicate<T>
	): Promise<[T, OpType.INSERT | OpType.UPDATE][]> {
		await this.checkPrivate();
		const modelConstructor = Object.getPrototypeOf(model)
			.constructor as PersistentModelConstructor<T>;
		const storeName = this.getStorenameForModel(modelConstructor);
		const connectedModels = traverseModel(
			modelConstructor.name,
			model,
			this.schema.namespaces[this.namespaceResolver(modelConstructor)]
		);
		const namespaceName = this.namespaceResolver(modelConstructor);

		const set = new Set<string>();
		const connectionStoreNames = Object.values(connectedModels).map(
			({ modelName, item, instance }) => {
				const storeName = this.getStorename(namespaceName, modelName);
				set.add(storeName);
				return { storeName, item, instance };
			}
		);
		const tx = this.db.transaction(
			[storeName, ...Array.from(set.values())],
			'readwrite'
		);
		const store = tx.objectStore(storeName);

		const fromDB = (await this._get(store, model.id)) as T | undefined;

		if (condition && fromDB) {
			const predicates = ModelPredicateCreator.getPredicates(condition);
			const { predicates: predicateObjs, type } = predicates || {};

			const isValid = validatePredicate(
				fromDB,
				type as any,
				predicateObjs as any
			);

			if (!isValid) {
				const msg = 'Conditional update failed';
				logger.error(msg, { model: fromDB, condition: predicateObjs });

				throw new Error(msg);
			}
		}

		const result: [T, OpType.INSERT | OpType.UPDATE][] = [];
		for await (const resItem of connectionStoreNames) {
			const { storeName, item, instance } = resItem;
			const store = tx.objectStore(storeName);
			const { id } = item;

			const fromDB = <T>await this._get(store, id);
			const opType: OpType =
				fromDB === undefined ? OpType.INSERT : OpType.UPDATE;

			// Even if the parent is an INSERT, the child might not be, so we need to get its key
			if (id === model.id || opType === OpType.INSERT) {
				const key = await store.index('byId').getKey(item.id);
				await store.put(item, key);
				result.push([instance, opType]);
			}
		}

		await tx.done;

		return result;
	}

	private async load<T>(
		namespaceName: NAMESPACES,
		srcModelName: string,
		records: T[]
	): Promise<T[]> {
		const namespace = this.schema.namespaces[namespaceName];
		const relations = namespace.relationships![srcModelName].relationTypes;
		const connectionStoreNames = relations.map(({ modelName }) => {
			return this.getStorename(namespaceName, modelName);
		});
		const modelConstructor = this.getModelConstructorByModelName!(
			namespaceName,
			srcModelName
		);

		if (connectionStoreNames.length === 0) {
			return records.map(record =>
				this.modelInstanceCreator(modelConstructor, record)
			);
		}

		return records.map(record =>
			this.modelInstanceCreator(modelConstructor, record)
		);
	}

	async query<T extends PersistentModel>(
		modelConstructor: PersistentModelConstructor<T>,
		predicate?: ModelPredicate<T>,
		pagination?: PaginationInput<T>
	): Promise<T[]> {
		await this.checkPrivate();
		const storeName = this.getStorenameForModel(modelConstructor);
		const namespaceName = this.namespaceResolver(
			modelConstructor
		) as NAMESPACES;

		const predicates =
			predicate && ModelPredicateCreator.getPredicates(predicate);
		const queryById = predicates && this.idFromPredicate(predicates);
		const hasSort = pagination && pagination.sort;
		const hasPagination = pagination && pagination.limit;

		const records: T[] = await (async () => {
			if (queryById) {
				const record = await this.getById(storeName, queryById);
				return record ? [record] : [];
			}

			if (predicates) {
				const filtered = await this.filterOnPredicate(storeName, predicates);
				return this.inMemoryPagination(filtered, pagination);
			}

			if (hasSort) {
				const all = await this.getAll(storeName);
				return this.inMemoryPagination(all, pagination);
			}

			if (hasPagination) {
				return this.enginePagination(storeName, pagination);
			}

			return this.getAll(storeName);
		})();

		return await this.load(namespaceName, modelConstructor.name, records);
	}

	private async getById<T extends PersistentModel>(
		storeName: string,
		id: string
	): Promise<T> {
		const record = <T>await this._get(storeName, id);
		return record;
	}

	private async getAll<T extends PersistentModel>(
		storeName: string
	): Promise<T[]> {
		return await this.db.getAll(storeName);
	}

	private idFromPredicate<T extends PersistentModel>(
		predicates: PredicatesGroup<T>
	) {
		const { predicates: predicateObjs } = predicates;
		const idPredicate =
			predicateObjs.length === 1 &&
			(predicateObjs.find(
				p => isPredicateObj(p) && p.field === 'id' && p.operator === 'eq'
			) as PredicateObject<T>);

		return idPredicate && idPredicate.operand;
	}

	private matchingIndex(
		storeName: string,
		fieldName: string,
		transaction: idb.IDBPTransaction<unknown, [string]>
	) {
		const store = transaction.objectStore(storeName);
		for (const name of store.indexNames) {
			const idx = store.index(name);
			if (idx.keyPath === fieldName) {
				return idx;
			}
		}
	}

	private async filterOnPredicate<T extends PersistentModel>(
		storeName: string,
		predicates: PredicatesGroup<T>
	) {
		let { predicates: predicateObjs, type } = predicates;

		// the predicate objects we care about tend to be nested at least
		// one level down: `{and: {or: {and: { <the predicates we want> }}}}`
		// so, we unpack and/or groups until we find a group with more than 1
		// child OR a child that is not a group (and is therefore a predicate "object").
		while (predicateObjs.length === 1 && isPredicateGroup(predicateObjs[0])) {
			type = (predicateObjs[0] as PredicatesGroup<T>).type;
			predicateObjs = (predicateObjs[0] as PredicatesGroup<T>).predicates;
		}

		// where we'll accumulate candidate results, which will be filtered at the end.
		let candidateResults: T[];

		// AFAIK, this will always be a homogenous group of predicate objects at this point.
		// but, if that ever changes, this pulls out just the predicates from the list that
		// are field-level predicate objects we can potentially smash against an index.
		const fieldPredicates = predicateObjs.filter(p =>
			isPredicateObj(p)
		) as PredicateObject<T>[];

		// several sub-queries could occur here. explicitly start a txn here to avoid
		// opening/closing multiple txns.
		const txn = this.db.transaction(storeName);

		// our potential indexes or lacks thereof.
		const predicateIndexes = fieldPredicates.map(p => {
			return {
				predicate: p,
				index: this.matchingIndex(storeName, String(p.field), txn),
			};
		});

		// semi-naive implementation:
		if (type === 'and') {
			// each condition must be satsified, we can form a base set with any
			// ONE of those conditions and then filter.
			const actualPredicateIndexes = predicateIndexes.filter(
				i => i.index && i.predicate.operator === 'eq'
			);
			if (actualPredicateIndexes.length > 0) {
				const predicateIndex = actualPredicateIndexes[0];
				candidateResults = <T[]>(
					await predicateIndex.index!.getAll(predicateIndex.predicate.operand)
				);
			} else {
				// no usable indexes
				candidateResults = <T[]>await this.getAll(storeName);
			}
		} else if (type === 'or') {
			// NOTE: each condition implies a potentially distinct set. we only benefit
			// from using indexes here if EVERY condition uses an index. if any one
			// index requires a table scan, we gain nothing from the indexes.
			// NOTE: results must be DISTINCT-ified if we leverage indexes.
			if (
				predicateIndexes.length > 0 &&
				predicateIndexes.every(i => i.index && i.predicate.operator === 'eq')
			) {
				const distinctResults = new Map<string, T>();
				for (const predicateIndex of predicateIndexes) {
					const resultGroup = <T[]>(
						await predicateIndex.index!.getAll(predicateIndex.predicate.operand)
					);
					for (const item of resultGroup) {
						// TODO: custom PK
						distinctResults.set(item.id, item);
					}
				}

				// we could conceivably check for special conditions and return early here.
				// but, this is simpler and has not yet had a measurable performance impact.
				candidateResults = Array.from(distinctResults.values());
			} else {
				// either no usable indexes or not all conditions can use one.
				candidateResults = <T[]>await this.getAll(storeName);
			}
		} else {
			// nothing intelligent we can do with `not` groups unless or until we start
			// smashing comparison operators against indexes -- at which point we could
			// perform some reversal here.
			candidateResults = <T[]>await this.getAll(storeName);
		}

		const filtered = predicateObjs
			? candidateResults.filter(m => validatePredicate(m, type, predicateObjs))
			: candidateResults;

		return filtered;
	}

	private inMemoryPagination<T extends PersistentModel>(
		records: T[],
		pagination?: PaginationInput<T>
	): T[] {
		return inMemoryPagination(records, pagination);
	}

	private async enginePagination<T extends PersistentModel>(
		storeName: string,
		pagination?: PaginationInput<T>
	): Promise<T[]> {
		let result: T[];

		if (pagination) {
			const { page = 0, limit = 0 } = pagination;
			const initialRecord = Math.max(0, page * limit) || 0;

			let cursor = await this.db
				.transaction(storeName)
				.objectStore(storeName)
				.openCursor();

			if (cursor && initialRecord > 0) {
				await cursor.advance(initialRecord);
			}

			const pageResults: T[] = [];
			const hasLimit = typeof limit === 'number' && limit > 0;

			while (cursor && cursor.value) {
				pageResults.push(cursor.value);

				if (hasLimit && pageResults.length === limit) {
					break;
				}

				cursor = await cursor.continue();
			}

			result = pageResults;
		} else {
			result = <T[]>await this.db.getAll(storeName);
		}

		return result;
	}

	async queryOne<T extends PersistentModel>(
		modelConstructor: PersistentModelConstructor<T>,
		firstOrLast: QueryOne = QueryOne.FIRST
	): Promise<T | undefined> {
		await this.checkPrivate();
		const storeName = this.getStorenameForModel(modelConstructor);

		const cursor = await this.db
			.transaction([storeName], 'readonly')
			.objectStore(storeName)
			.openCursor(undefined, firstOrLast === QueryOne.FIRST ? 'next' : 'prev');

		const result = cursor ? <T>cursor.value : undefined;

		return result && this.modelInstanceCreator(modelConstructor, result);
	}

	async delete<T extends PersistentModel>(
		modelOrModelConstructor: T | PersistentModelConstructor<T>,
		condition?: ModelPredicate<T>
	): Promise<[T[], T[]]> {
		await this.checkPrivate();
		const deleteQueue: { storeName: string; items: T[] }[] = [];

		if (isModelConstructor(modelOrModelConstructor)) {
			const modelConstructor =
				modelOrModelConstructor as PersistentModelConstructor<T>;
			const nameSpace = this.namespaceResolver(modelConstructor) as NAMESPACES;

			const storeName = this.getStorenameForModel(modelConstructor);

			const models = await this.query(modelConstructor, condition!);
			const relations =
				this.schema.namespaces![nameSpace].relationships![modelConstructor.name]
					.relationTypes;

			if (condition !== undefined) {
				await this.deleteTraverse(
					relations,
					models,
					modelConstructor.name,
					nameSpace,
					deleteQueue
				);

				await this.deleteItem(deleteQueue);

				const deletedModels = deleteQueue.reduce(
					(acc, { items }) => acc.concat(items),
					<T[]>[]
				);

				return [models, deletedModels];
			} else {
				await this.deleteTraverse(
					relations,
					models,
					modelConstructor.name,
					nameSpace,
					deleteQueue
				);

				// Delete all
				await this.db
					.transaction([storeName], 'readwrite')
					.objectStore(storeName)
					.clear();

				const deletedModels = deleteQueue.reduce(
					(acc, { items }) => acc.concat(items),
					<T[]>[]
				);

				return [models, deletedModels];
			}
		} else {
			const model = modelOrModelConstructor as T;

			const modelConstructor = Object.getPrototypeOf(model)
				.constructor as PersistentModelConstructor<T>;
			const nameSpace = this.namespaceResolver(modelConstructor) as NAMESPACES;

			const storeName = this.getStorenameForModel(modelConstructor);

			if (condition) {
				const tx = this.db.transaction([storeName], 'readwrite');
				const store = tx.objectStore(storeName);

				const fromDB = await this._get(store, model.id);

				if (fromDB === undefined) {
					const msg = 'Model instance not found in storage';
					logger.warn(msg, { model });

					return [[model], []];
				}

				const predicates = ModelPredicateCreator.getPredicates(condition);
				const { predicates: predicateObjs, type } =
					predicates as PredicatesGroup<T>;

				const isValid = validatePredicate(fromDB as T, type, predicateObjs);

				if (!isValid) {
					const msg = 'Conditional update failed';
					logger.error(msg, { model: fromDB, condition: predicateObjs });

					throw new Error(msg);
				}
				await tx.done;

				const relations =
					this.schema.namespaces[nameSpace].relationships![
						modelConstructor.name
					].relationTypes;

				await this.deleteTraverse(
					relations,
					[model],
					modelConstructor.name,
					nameSpace,
					deleteQueue
				);
			} else {
				const relations =
					this.schema.namespaces[nameSpace].relationships![
						modelConstructor.name
					].relationTypes;

				await this.deleteTraverse(
					relations,
					[model],
					modelConstructor.name,
					nameSpace,
					deleteQueue
				);
			}

			await this.deleteItem(deleteQueue);

			const deletedModels = deleteQueue.reduce(
				(acc, { items }) => acc.concat(items),
				<T[]>[]
			);

			return [[model], deletedModels];
		}
	}

	private async deleteItem<T extends PersistentModel>(
		deleteQueue?: { storeName: string; items: T[] | IDBValidKey[] }[]
	) {
		const connectionStoreNames = deleteQueue!.map(({ storeName }) => {
			return storeName;
		});

		const tx = this.db.transaction([...connectionStoreNames], 'readwrite');
		for await (const deleteItem of deleteQueue!) {
			const { storeName, items } = deleteItem;
			const store = tx.objectStore(storeName);

			for await (const item of items) {
				if (item) {
					let key: IDBValidKey;

					if (typeof item === 'object') {
						key = (await store.index('byId').getKey(item['id']))!;
					} else {
						key = (await store.index('byId').getKey(item.toString()))!;
					}

					if (key !== undefined) {
						await store.delete(key);
					}
				}
			}
		}
	}

	private async deleteTraverse<T extends PersistentModel>(
		relations: RelationType[],
		models: T[],
		srcModel: string,
		nameSpace: NAMESPACES,
		deleteQueue: { storeName: string; items: T[] }[]
	): Promise<void> {
		for await (const rel of relations) {
			const { relationType, fieldName, modelName, targetName } = rel;
			const storeName = this.getStorename(nameSpace, modelName);

			const index: string =
				getIndex(
					this.schema.namespaces[nameSpace].relationships![modelName]
						.relationTypes,
					srcModel
				) ||
				// if we were unable to find an index via relationTypes
				// i.e. for keyName connections, attempt to find one by the
				// associatedWith property
				getIndexFromAssociation(
					this.schema.namespaces[nameSpace].relationships![modelName].indexes,
					rel.associatedWith!
				);

			switch (relationType) {
				case 'HAS_ONE':
					for await (const model of models) {
						const hasOneIndex = index || 'byId';

						const hasOneCustomField = targetName! in model;
						const value = hasOneCustomField ? model[targetName!] : model.id;

						const recordToDelete = <T>(
							await this.db
								.transaction(storeName, 'readwrite')
								.objectStore(storeName)
								.index(hasOneIndex)
								.get(value)
						);

						await this.deleteTraverse(
							this.schema.namespaces[nameSpace].relationships![modelName]
								.relationTypes,
							recordToDelete ? [recordToDelete] : [],
							modelName,
							nameSpace,
							deleteQueue
						);
					}
					break;
				case 'HAS_MANY':
					for await (const model of models) {
						const childrenArray = await this.db
							.transaction(storeName, 'readwrite')
							.objectStore(storeName)
							.index(index)
							.getAll(model['id']);

						await this.deleteTraverse(
							this.schema.namespaces[nameSpace].relationships![modelName]
								.relationTypes,
							childrenArray,
							modelName,
							nameSpace,
							deleteQueue
						);
					}
					break;
				case 'BELONGS_TO':
					// Intentionally blank
					break;
				// case 'MANY_TO_MANY':
				// 	// TODO: implement
				// 	throw new Error('WRITE THIS CODE');
				default:
					throw new Error(`Invalid relation type ${relationType}`);
					break;
			}
		}

		deleteQueue.push({
			storeName: this.getStorename(nameSpace, srcModel),
			items: models.map(record =>
				this.modelInstanceCreator(
					this.getModelConstructorByModelName!(nameSpace, srcModel),
					record
				)
			),
		});
	}

	async clear(): Promise<void> {
		await this.checkPrivate();

		this.db.close();

		await idb.deleteDB(this.dbName);

		this.db = undefined!;
		this.initPromise = undefined!;
	}

	async batchSave<T extends PersistentModel>(
		modelConstructor: PersistentModelConstructor<any>,
		items: ModelInstanceMetadata[]
	): Promise<[T, OpType][]> {
		if (items.length === 0) {
			return [];
		}

		await this.checkPrivate();

		const result: [T, OpType][] = [];

		const storeName = this.getStorenameForModel(modelConstructor);

		const txn = this.db.transaction(storeName, 'readwrite');
		const store = txn.store;

		for (const item of items) {
			const connectedModels = traverseModel(
				modelConstructor.name,
				this.modelInstanceCreator(modelConstructor, item),
				this.schema.namespaces[this.namespaceResolver(modelConstructor)]
			);

			const { id, _deleted } = item;
			const index = store.index('byId');
			const key = await index.getKey(id);

			if (!_deleted) {
				const { instance } = connectedModels.find(
					({ instance }) => instance.id === id
				)!;

				result.push([
					<T>(<unknown>instance),
					key ? OpType.UPDATE : OpType.INSERT,
				]);
				await store.put(instance, key);
			} else {
				result.push([<T>(<unknown>item), OpType.DELETE]);

				if (key) {
					await store.delete(key);
				}
			}
		}

		await txn.done;

		return result;
	}
}

export default new IndexedDBAdapter();
