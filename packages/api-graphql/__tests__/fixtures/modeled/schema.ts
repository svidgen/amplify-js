import { type ClientSchema, a } from '@aws-amplify/amplify-api-next-alpha';

const schema = a.schema({
	Todo: a
		.model({
			name: a.string(),
			description: a.string(),
			notes: a.hasMany('Note'),
			meta: a.hasOne('TodoMetadata'),
		})
		.authorization([a.allow.public('apiKey'), a.allow.owner()]),
	Note: a
		.model({
			body: a.string().required(),
			todo: a.belongsTo('Todo'),
		})
		.authorization([a.allow.public('apiKey'), a.allow.owner()]),
	TodoMetadata: a
		.model({
			data: a.string(),
		})
		.authorization([a.allow.public('apiKey'), a.allow.owner()]),
	ThingWithCustomerOwnerField: a
		.model({
			id: a.id(),
			description: a.string(),
		})
		.authorization([a.allow.owner('userPools').inField('customField')]),
	ThingWithOwnerFieldSpecifiedInModel: a
		.model({
			id: a.id(),
			name: a.string(),
			owner: a.string(),
		})
		.authorization([a.allow.owner()]),
	ThingWithAPIKeyAuth: a
		.model({
			id: a.id(),
			description: a.string(),
		})
		.authorization([a.allow.public('apiKey')]),
	ThingWithoutExplicitAuth: a.model({
		id: a.id(),
		description: a.string(),
	}),
	ThingWithCustomPk: a
		.model({
			cpk_cluster_key: a.string().required(),
			cpk_sort_key: a.string().required(),
			otherField: a.string(),
		})
		.identifier(['cpk_cluster_key', 'cpk_sort_key']),
	Team: a
		.model({
			mantra: a.string(),
			members: a.hasMany('Member'),
		})
		.authorization([a.allow.public()]),

	Member: a
		.model({
			name: a.string(),
			dateOfBirth: a.date(),
		})
		.authorization([a.allow.public()]),
});

export type Schema = ClientSchema<typeof schema>;
