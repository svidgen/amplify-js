import {
	IdentifierFieldOrIdentifierObject,
	PersistentModel,
	PersistentModelConstructor,
	PersistentModelMetaData,
	ProducerPaginationInput,
	RecursiveModelPredicate,
	RecursiveModelPredicateExtender,
	RecursiveModelPredicateAggregateExtender,
	PredicateInternalsKey,
} from '../src/types';

export type DataStoreItemProps<Model extends PersistentModel> = {
	model: PersistentModelConstructor<Model>;
	id: IdentifierFieldOrIdentifierObject<Model, PersistentModelMetaData<Model>>;
};

export type DataStoreCollectionProps<Model extends PersistentModel> = {
	model: PersistentModelConstructor<Model>;
	criteria?: RecursiveModelPredicateExtender<Model>;
	pagination?: ProducerPaginationInput<Model>;
};

type DataStoreBaseResult = {
	error?: Error;
	isLoading: boolean;
};

export type DataStoreItemResult<Model extends PersistentModel> =
	DataStoreBaseResult & { item?: Model };

export type DataStoreCollectionResult<Model extends PersistentModel> =
	DataStoreBaseResult & { items: Model[] };

export type DataStoreBindingProps<
	Model extends PersistentModel,
	BindingType extends 'record' | 'collection'
> = {
	type: BindingType;
} & (BindingType extends 'record'
	? DataStoreItemProps<Model>
	: BindingType extends 'collection'
	? DataStoreCollectionProps<Model>
	: never);

export type DataStorePredicateObject = {
	and?: DataStorePredicateObject[];
	or?: DataStorePredicateObject[];
	field?: string;
	operand?: string;
	operator?: string;
};

export const createDataStorePredicate = <Model extends PersistentModel>(
	predicateObject: DataStorePredicateObject
): RecursiveModelPredicateExtender<Model> => {
	const {
		and: groupAnd,
		or: groupOr,
		field,
		operator,
		operand,
	} = predicateObject;

	if (Array.isArray(groupAnd)) {
		return p =>
			p.and(inner => groupAnd.map(c => createDataStorePredicate(c)(inner)));
	} else if (Array.isArray(groupOr)) {
		return p =>
			p.or(inner => groupOr.map(c => createDataStorePredicate(c)(inner)));
	}

	const predicate = (p: RecursiveModelPredicate<Model>) => {
		if (typeof p?.[field!]?.[operator!] === 'function') {
			return p[field!][operator!](operand);
		}

		return p;
	};

	return predicate;
};

const namePredicateObject = {
	field: 'name',
	operator: 'startsWith',
	operand: 'John',
};

test('should generate a simple predicate', () => {
	const predicate = createDataStorePredicate<any>(namePredicateObject);

	const namePredicate = jest.fn();
	const model = {
		[namePredicateObject.field]: {
			[namePredicateObject.operator]: namePredicate,
		},
	};

	predicate(model as any);
	expect(namePredicate).toHaveBeenCalledWith(namePredicateObject.operand);
});
