import {
	Scalar,
	PersistentModel,
	// PersistentModelConstructor,
	SchemaModel,
	ModelFieldType,
	ModelAssociation,
	PaginationInput,
	QueryOne,
	ModelPredicate as FlatModelPredicate,
	PredicateExpression as FlatPredicateExpression,
	InternalSchema,
	ModelMeta,
	PersistentModelConstructor,
	AllOperators,
} from '../types';

import { ModelPredicateCreator as FlatModelPredicateCreator } from './index';
import { ExclusiveStorage as StorageAdapter } from '../storage/storage';

type MatchableTypes =
	| string
	| string[]
	| number
	| number[]
	| boolean
	| boolean[];

type AllFieldOperators = keyof AllOperators;

// TODO: this is TEMP to make the types work.
class AsyncCollection<T> {
	toArray(): T[] {
		return [];
	}
}

type FinalFieldType<T> = NonNullable<
	Scalar<
		T extends Promise<infer InnerPromiseType>
			? InnerPromiseType
			: T extends AsyncCollection<infer InnerCollectionType>
			? InnerCollectionType
			: T
	>
>;

const ops: AllFieldOperators[] = [
	'eq',
	'ne',
	'gt',
	'ge',
	'lt',
	'le',
	'beginsWith',
	'between',
	'contains',
	'notContains',
];

export type ModelPredicateExtender<RT extends PersistentModel> = (
	lambda: ModelPredicate<RT>
) => {
	__query: GroupCondition;
}[];

export type SingularModelPredicateExtender<RT extends PersistentModel> = (
	lambda: ModelPredicate<RT>
) => {
	__query: GroupCondition;
};

type ValuePredicate<RT extends PersistentModel, MT extends MatchableTypes> = {
	[K in AllFieldOperators]: (...operands: Scalar<MT>[]) => FinalModelPredicate;
};

type ModelPredicateOperator<RT extends PersistentModel> = (
	...predicates: [ModelPredicateExtender<RT>] | FinalModelPredicate[]
) => FinalModelPredicate;

type ModelPredicateNegation<RT extends PersistentModel> = (
	predicate: SingularModelPredicateExtender<RT> | FinalModelPredicate
) => FinalModelPredicate;

type ModelPredicate<RT extends PersistentModel> = {
	[K in keyof RT]-?: FinalFieldType<RT[K]> extends PersistentModel
		? ModelPredicate<FinalFieldType<RT[K]>>
		: ValuePredicate<RT, RT[K]>;
} & {
	or: ModelPredicateOperator<RT>;
	and: ModelPredicateOperator<RT>;
	not: ModelPredicateNegation<RT>;
	__copy: () => ModelPredicate<RT>;
} & FinalModelPredicate;

export type FinalModelPredicate = {
	__query: GroupCondition;
	__tail: GroupCondition;
	filter: <T>(items: T[]) => Promise<T[]>;
};

type GroupOperator = 'and' | 'or' | 'not';

type UntypedCondition = {
	fetch: (storage: StorageAdapter) => Promise<Record<string, any>[]>;
	matches: (item: Record<string, any>) => Promise<boolean>;
	copy(extract: GroupCondition): [UntypedCondition, GroupCondition | undefined];
};

export class FieldCondition {
	constructor(
		public field: string,
		public operator: string, // TODO: tighter type?
		public operands: string[]
	) {
		this.validate();
	}

	copy(extract: GroupCondition): [FieldCondition, GroupCondition | undefined] {
		return [
			new FieldCondition(this.field, this.operator, [...this.operands]),
			undefined,
		];
	}

	async fetch(storage: StorageAdapter): Promise<Record<string, any>[]> {
		return Promise.reject('Not yet implemented.');
	}

	async matches(item: Record<string, any>): Promise<boolean> {
		const v = String(item[this.field]);
		const operations = {
			eq: () => v === this.operands[0],
			ne: () => v !== this.operands[0],
			gt: () => v > this.operands[0],
			ge: () => v >= this.operands[0],
			lt: () => v < this.operands[0],
			le: () => v <= this.operands[0],
			contains: () => v.indexOf(this.operands[0]) > -1,
			notContains: () => v.indexOf(this.operands[0]) < 0,
			beginsWith: () => v.startsWith(this.operands[0]),
			between: () => v >= this.operands[0] && v <= this.operands[1],
		};
		const operation = operations[this.operator as keyof typeof operations];
		if (operation) {
			return operation();
		} else {
			throw new Error(`Invalid operator given: ${this.operator}`);
		}
	}

	validate(): void {
		const _t = this;
		function argumentCount(count) {
			const argsClause = count === 1 ? 'argument is' : 'arguments are';
			return () => {
				if (_t.operands.length !== count) {
					return `Exactly ${count} ${argsClause} required.`;
				}
			};
		}

		// NOTE: validations should return a message on failure.
		// hence, they should be "joined" together with logical OR's.
		const validations = {
			eq: argumentCount(1),
			ne: argumentCount(1),
			gt: argumentCount(1),
			ge: argumentCount(1),
			lt: argumentCount(1),
			le: argumentCount(1),
			contains: argumentCount(1),
			notContains: argumentCount(1),
			beginsWith: argumentCount(1),
			between: () =>
				argumentCount(2)() ||
				(this.operands[0] > this.operands[1]
					? 'The first argument must be less than or equal to the second argument.'
					: null),
		};
		const validate = validations[this.operator as keyof typeof validations];
		if (validate) {
			const e = validate();
			if (typeof e === 'string')
				throw new Error(`Incorrect usage of \`${this.operator}()\`: ${e}`);
		} else {
			throw new Error(`Non-existent operator: \`${this.operator}()\``);
		}
	}
}

export class GroupCondition {
	// for debugging
	public groupId: string =
		new Date().getTime() + '.' + (Math.random() * 1000).toFixed(3);

	constructor(
		public model: ModelMeta<any>,
		public field: string | undefined,
		public relationshipType: string | undefined,
		public operator: GroupOperator,
		public operands: UntypedCondition[]
	) {}

	copy(extract: GroupCondition): [GroupCondition, GroupCondition | undefined] {
		const copied = new GroupCondition(
			this.model,
			this.field,
			this.relationshipType,
			this.operator,
			[]
		);

		let extractedCopy: GroupCondition | undefined =
			extract === this ? copied : undefined;

		this.operands.forEach(o => {
			const [operandCopy, extractedFromOperand] = o.copy(extract);
			copied.operands.push(operandCopy);
			extractedCopy = extractedCopy || extractedFromOperand;
		});

		return [copied, extractedCopy];
	}

	async fetch(
		storage: StorageAdapter,
		breadcrumb = [],
		negate = false
	): Promise<Record<string, any>[]> {
		const resultGroups: Array<Record<string, any>[]> = [];

		const negations = {
			and: 'or',
			or: 'and',
			not: 'and',
			eq: 'ne',
			ne: 'eq',
			gt: 'le',
			ge: 'lt',
			lt: 'ge',
			le: 'gt',
			contains: 'notContains',
			notContains: 'contains',
		};

		const operator = (negate ? negations[this.operator] : this.operator) as
			| 'or'
			| 'and'
			| 'not';

		const negateChildren = negate !== (this.operator === 'not');

		const groups = this.operands.filter(
			op => op instanceof GroupCondition
		) as GroupCondition[];

		const conditions = this.operands.filter(
			op => op instanceof FieldCondition
		) as FieldCondition[];

		// TODO: fetch Predicate.ALL return early here?
		// TODO: parallize. (some storage engines may optimize parallel requests)
		for (const g of groups) {
			const relatives = await g.fetch(
				storage,
				[...breadcrumb, this.groupId],
				negateChildren
			);

			if (g.field) {
				// relatives needs to be used to find candidate results.
				// TODO: replace with lazy loading? ... :D ...
				const meta = this.model.schema.fields[g.field];
				const gIdField = 'id';
				if (meta.association) {
					let candidates = [];

					let leftHandField;
					if (meta.association.targetName == null) {
						leftHandField = 'id';
					} else {
						leftHandField = meta.association.targetName;
					}

					let rightHandField;
					if ((meta.association as any).associatedWith) {
						rightHandField = (meta.association as any).associatedWith;
					} else {
						rightHandField = 'id';
					}

					for (const relative of relatives) {
						const rightHandValue = relative[rightHandField].id
							? relative[rightHandField].id
							: relative[rightHandField];
						const predicate = FlatModelPredicateCreator.createFromExisting(
							this.model.schema,
							p => p[leftHandField]('eq' as never, rightHandValue as never)
						);
						candidates = [
							...candidates,
							...(await storage.query(this.model.builder, predicate as any)),
						];
					}
					resultGroups.push(candidates);
				} else {
					throw new Error('Missing field metadata.');
				}
			} else {
				// relatives are not actually relatives. they're candidate results.
				resultGroups.push(relatives);
			}
		}

		function addConditions<T>(predicate: T): T {
			let p = predicate;
			const finalConditions = [];

			for (const c of conditions) {
				if (negateChildren) {
					if (c.operator === 'between') {
						finalConditions.push(
							new FieldCondition(c.field, 'lt', [c.operands[0]]),
							new FieldCondition(c.field, 'gt', [c.operands[1]])
						);
					} else {
						finalConditions.push(
							new FieldCondition(c.field, negations[c.operator], c.operands)
						);
					}
				} else {
					finalConditions.push(c);
				}
			}

			for (const c of finalConditions) {
				p = p[c.field](
					c.operator as never,
					(c.operator === 'between' ? c.operands : c.operands[0]) as never
				);
			}
			return p;
		}

		// if conditions is empty at this point, child predicates found no matches.
		// i.e., we can stop looking and return empty.
		if (conditions.length > 0) {
			const predicate = FlatModelPredicateCreator.createFromExisting(
				this.model.schema,
				p => p[operator](c => addConditions(c))
			);
			resultGroups.push(
				await storage.query(this.model.builder, predicate as any)
			);
		} else if (conditions.length === 0 && resultGroups.length === 0) {
			resultGroups.push(await storage.query(this.model.builder));
		}

		// this needs to be read from metadata.
		const idField = 'id';
		let resultIndex: Record<string, Record<string, any>> = {};

		if (operator === 'and') {
			if (resultGroups.length === 0) {
				return [];
			}

			resultIndex = resultGroups[0].reduce((agg, item) => {
				return { ...agg, ...{ [item[idField]]: item } };
			}, {});

			resultGroups.forEach(group => {
				resultIndex = group.reduce((agg, item) => {
					const id = item[idField];
					if (resultIndex[id]) agg[id] = item;
					return agg;
				}, {});
			});
		} else if (operator === 'or' || operator === 'not') {
			// it's OK to handle NOT here, because NOT must always only negate
			// a single child predicate. NOT logic will have been distributed down
			// to the leaf conditions already.
			resultGroups.forEach(group => {
				resultIndex = {
					...resultIndex,
					...group.reduce((agg, item) => {
						return { ...agg, ...{ [item[idField]]: item } };
					}, {}),
				};
			});
		}
		const results = Object.values(resultIndex);
		return results;
	}

	// ALT for `ignoreFieldName` could be to copy and strip off `fieldName`
	// when recursing for `HAS_MANY`.
	async matches(
		item: Record<string, any>,
		ignoreFieldName: boolean = false
	): Promise<boolean> {
		const itemToCheck =
			this.field && !ignoreFieldName ? await item[this.field] : item;

		if (this.relationshipType === 'HAS_MANY' && itemToCheck instanceof Array) {
			for (const singleItem of itemToCheck) {
				if (await this.matches(singleItem, true)) {
					return true;
				}
			}
			return false;
		}

		if (this.operator === 'or') {
			return asyncSome(this.operands, c => c.matches(itemToCheck));
		} else if (this.operator === 'and') {
			return asyncEvery(this.operands, c => c.matches(itemToCheck));
		} else if (this.operator === 'not') {
			if (this.operands.length !== 1) {
				throw new Error(
					'Invalid arguments! `not()` accepts exactly one predicate expression.'
				);
			}
			return !(await this.operands[0].matches(itemToCheck));
		} else {
			throw new Error('Invalid group operator!');
		}
	}
}

export async function asyncSome(
	items: Record<string, any>[],
	matches: (item: Record<string, any>) => Promise<boolean>
): Promise<boolean> {
	for (const item of items) {
		if (await matches(item)) {
			return true;
		}
	}
	return false;
}

export async function asyncEvery(
	items: Record<string, any>[],
	matches: (item: Record<string, any>) => Promise<boolean>
): Promise<boolean> {
	for (const item of items) {
		if (!(await matches(item))) {
			return false;
		}
	}
	return true;
}

export async function asyncFilter<T>(
	items: T[],
	matches: (item: T) => Promise<boolean>
): Promise<T[]> {
	const results = [];
	for (const item of items) {
		if (await matches(item)) {
			results.push(item);
		}
	}
	return results;
}

// TODO: wayyyyyy too much nesting. DECOMPOSE.
// TODO: shouldn't this be returning FinalModelPredicate<T>?
export function predicateFor<T extends PersistentModel>(
	ModelType: ModelMeta<T>,
	field?: string,
	query?: GroupCondition,
	tail?: GroupCondition
): ModelPredicate<T> {
	//
	// TODO: when/where/how do we bail if `ModelType.__meta.syncable == false`?
	//

	// using this type explicitly instead of depending on the inference from ModelType
	// solves the "Type instantiation is excessively deep and possibly infinite" error.
	// Why? ... I have no idea. If someone can tell me ... uhh ... please do.
	// type IndirectT = typeof ModelType extends ModelMeta<infer I> ? I : never;

	const link = {
		__query:
			query || new GroupCondition(ModelType, field, undefined, 'and', []),
		__tail: new GroupCondition(ModelType, field, undefined, 'and', []),
		__copy: () => {
			const [query, newtail] = link.__query.copy(link.__tail);
			return predicateFor(ModelType, undefined, query, newtail);
		},
	} as ModelPredicate<T>;

	// if we're already building on a query, we need to extend it.
	// the tail is already constructed. just add it.
	if (tail) {
		link.__tail = tail;
	} else if (query) {
		link.__query.operands.push(link.__tail);
	} else {
		// only if it's a new query does tail === head
		link.__tail = link.__query;
	}

	// TODO: better handled with proxy?
	['and', 'or'].forEach(op => {
		(link as any)[op] = (
			...builderOrPredicates:
				| [ModelPredicateExtender<T>]
				| FinalModelPredicate[]
		): FinalModelPredicate => {
			const newlink = link.__copy();
			newlink.__tail.operands.push(
				new GroupCondition(
					ModelType,
					field,
					undefined,
					op as 'and' | 'or',
					typeof builderOrPredicates[0] === 'function'
						? builderOrPredicates[0](predicateFor(ModelType)).map(
								p => p.__query
						  )
						: (builderOrPredicates as FinalModelPredicate[]).map(p => p.__query)
				)
			);

			// hmm ... do all these underscore props need to be here?
			return {
				__query: newlink.__query,
				__tail: newlink.__tail,
				filter: items => {
					return asyncFilter(items, i => newlink.__query.matches(i));
				},
			};
		};
	});

	link.not = (
		builderOrPredicate: SingularModelPredicateExtender<T> | FinalModelPredicate
	): FinalModelPredicate => {
		const newlink = link.__copy();
		newlink.__tail.operands.push(
			new GroupCondition(
				ModelType,
				field,
				undefined,
				'not',
				typeof builderOrPredicate === 'function'
					? [builderOrPredicate(predicateFor(ModelType)).__query]
					: [builderOrPredicate.__query]
			)
		);

		// hmm ... do all these underscore props need to be here?
		return {
			__query: newlink.__query,
			__tail: newlink.__tail,
			filter: items => {
				return asyncFilter(items, i => newlink.__query.matches(i));
			},
		};
	};

	for (const fieldName in ModelType.schema.fields) {
		Object.defineProperty(link, fieldName, {
			enumerable: true,
			get: () => {
				const def = ModelType.schema.fields[fieldName];
				if (!def.association) {
					return ops.reduce((fieldMatcher, operator) => {
						return {
							...fieldMatcher,
							[operator]: (...operands: any[]) => {
								const newlink = link.__copy();
								newlink.__tail.operands.push(
									new FieldCondition(fieldName, operator, operands)
								);

								// same question as above: do all these underscore props need to be here?
								return {
									__query: newlink.__query,
									__tail: newlink.__tail,
									filter: items => {
										return asyncFilter(items, i => newlink.__query.matches(i));
									},
								};
							},
						};
					}, {});
				} else {
					if (
						def.association.connectionType === 'BELONGS_TO' ||
						def.association.connectionType === 'HAS_ONE' ||
						def.association.connectionType === 'HAS_MANY'
					) {
						const [newquery, oldtail] = link.__query.copy(link.__tail);
						const newtail = new GroupCondition(
							(def.type as ModelFieldType).modelConstructor,
							fieldName,
							def.association.connectionType,
							'and',
							[]
						);
						(oldtail as GroupCondition).operands.push(newtail);
						const newlink = predicateFor(
							(def.type as ModelFieldType).modelConstructor,
							undefined,
							newquery,
							newtail
						);
						return newlink;
					} else if (def.association.connectionType === 'HAS_MANY') {
						// i suspect we'll need a separate implementation here ... but it's not yet
						// needed for the `filter()` use-case.
						throw new Error('Not implemented yet.');
					} else {
						throw new Error(
							"Oh no! Related Model definition doesn't have a typedef!"
						);
					}
				}
			},
		});
	}

	return link;
}
