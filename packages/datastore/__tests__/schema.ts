import { Schema } from '../src/types';

export const newSchema: Schema = {
	models: {
		Blog: {
			syncable: true,
			name: 'Blog',
			pluralName: 'Blogs',
			attributes: [
				{
					type: 'model',
					properties: {},
				},
			],
			fields: {
				id: {
					name: 'id',
					isArray: false,
					type: 'ID',
					isRequired: true,
					attributes: [],
				},
				name: {
					name: 'name',
					isArray: false,
					type: 'String',
					isRequired: true,
					attributes: [],
				},
				posts: {
					name: 'posts',
					isArray: true,
					type: {
						model: 'Post',
					},
					isRequired: false,
					attributes: [],
					association: {
						connectionType: 'HAS_MANY',
						associatedWith: 'blog',
					},
				},
				owner: {
					name: 'owner',
					isArray: false,
					type: {
						model: 'BlogOwner',
					},
					isRequired: true,
					attributes: [],
					association: {
						connectionType: 'BELONGS_TO',
						targetName: 'blogOwnerId',
					},
				},
			},
		},
		Post: {
			syncable: true,
			name: 'Post',
			pluralName: 'Posts',
			attributes: [
				{
					type: 'model',
					properties: {},
				},
			],
			fields: {
				id: {
					name: 'id',
					isArray: false,
					type: 'ID',
					isRequired: true,
					attributes: [],
				},
				title: {
					name: 'title',
					isArray: false,
					type: 'String',
					isRequired: true,
					attributes: [],
				},
				reference: {
					name: 'reference',
					isArray: false,
					type: {
						model: 'Post',
					},
					isRequired: false,
					attributes: [],
					association: {
						connectionType: 'BELONGS_TO',
						targetName: 'referencePostId',
					},
				},
				blog: {
					name: 'blog',
					isArray: false,
					type: {
						model: 'Blog',
					},
					isRequired: false,
					attributes: [],
					association: {
						connectionType: 'BELONGS_TO',
						targetName: 'postBlogId',
					},
				},
				comments: {
					name: 'comments',
					isArray: true,
					type: {
						model: 'Comment',
					},
					isRequired: false,
					attributes: [],
					association: {
						connectionType: 'HAS_MANY',
						associatedWith: 'post',
					},
				},
				authors: {
					name: 'authors',
					isArray: true,
					type: {
						model: 'PostAuthorJoin',
					},
					isRequired: false,
					attributes: [],
					association: {
						connectionType: 'HAS_MANY',
						associatedWith: 'post',
					},
				},
				metadata: {
					name: 'metadata',
					isArray: false,
					type: {
						nonModel: 'PostMetadata',
					},
					isRequired: false,
					attributes: [],
				},
			},
		},
		Comment: {
			syncable: true,
			name: 'Comment',
			pluralName: 'Comments',
			attributes: [
				{
					type: 'model',
					properties: {},
				},
			],
			fields: {
				id: {
					name: 'id',
					isArray: false,
					type: 'ID',
					isRequired: true,
					attributes: [],
				},
				content: {
					name: 'content',
					isArray: false,
					type: 'String',
					isRequired: false,
					attributes: [],
				},
				post: {
					name: 'post',
					isArray: false,
					type: {
						model: 'Post',
					},
					isRequired: false,
					attributes: [],
					association: {
						connectionType: 'BELONGS_TO',
						targetName: 'commentPostId',
					},
				},
			},
		},
		Song: {
			syncable: true,
			name: 'Song',
			pluralName: 'Songs',
			attributes: [
				{
					type: 'model',
					properties: {},
				},
			],
			fields: {
				id: {
					name: 'id',
					isArray: false,
					type: 'ID',
					isRequired: true,
					attributes: [],
				},
				songID: {
					name: 'songID',
					isArray: false,
					type: 'ID',
					isRequired: true,
					attributes: [],
				},
				content: {
					name: 'content',
					isArray: false,
					type: 'String',
					isRequired: false,
					attributes: [],
				},
			},
		},
		Album: {
			syncable: true,
			name: 'Album',
			pluralName: 'Albums',
			attributes: [
				{
					type: 'model',
					properties: {},
				},
			],
			fields: {
				id: {
					name: 'id',
					isArray: false,
					type: 'ID',
					isRequired: true,
					attributes: [],
				},
				name: {
					name: 'name',
					isArray: false,
					type: 'String',
					isRequired: false,
					attributes: [],
				},
				songs: {
					name: 'songs',
					isArray: true,
					type: {
						model: 'Song',
					},
					isRequired: false,
					attributes: [],
					isArrayNullable: true,
					association: {
						connectionType: 'HAS_MANY',
						associatedWith: 'songID',
					},
				},
			},
		},
		PostAuthorJoin: {
			syncable: true,
			name: 'PostAuthorJoin',
			pluralName: 'PostAuthorJoins',
			attributes: [
				{
					type: 'model',
					properties: {},
				},
				{
					type: 'key',
					properties: {
						name: 'byAuthor',
						fields: ['authorId'],
					},
				},
				{
					type: 'key',
					properties: {
						name: 'byPost',
						fields: ['postId'],
					},
				},
			],
			fields: {
				id: {
					name: 'id',
					isArray: false,
					type: 'ID',
					isRequired: true,
					attributes: [],
				},
				author: {
					name: 'author',
					isArray: false,
					type: {
						model: 'Author',
					},
					isRequired: false,
					attributes: [],
					association: {
						connectionType: 'BELONGS_TO',
						targetName: 'authorId',
					},
				},
				post: {
					name: 'post',
					isArray: false,
					type: {
						model: 'Post',
					},
					isRequired: false,
					attributes: [],
					association: {
						connectionType: 'BELONGS_TO',
						targetName: 'postId',
					},
				},
			},
		},
		Author: {
			syncable: true,
			name: 'Author',
			pluralName: 'Authors',
			attributes: [
				{
					type: 'model',
					properties: {},
				},
			],
			fields: {
				id: {
					name: 'id',
					isArray: false,
					type: 'ID',
					isRequired: true,
					attributes: [],
				},
				name: {
					name: 'name',
					isArray: false,
					type: 'String',
					isRequired: true,
					attributes: [],
				},
				posts: {
					name: 'posts',
					isArray: true,
					type: {
						model: 'PostAuthorJoin',
					},
					isRequired: false,
					attributes: [],
					association: {
						connectionType: 'HAS_MANY',
						associatedWith: 'author',
					},
				},
			},
		},
		Forum: {
			syncable: true,
			name: 'Forum',
			pluralName: 'Forums',
			attributes: [
				{
					type: 'model',
					properties: {},
				},
			],
			fields: {
				id: {
					name: 'id',
					isArray: false,
					type: 'ID',
					isRequired: true,
					attributes: [],
				},
				title: {
					name: 'title',
					isArray: false,
					type: 'String',
					isRequired: true,
					attributes: [],
				},
				editors: {
					name: 'editors',
					isArray: true,
					type: {
						model: 'ForumEditorJoin',
					},
					isRequired: false,
					attributes: [],
					association: {
						connectionType: 'HAS_MANY',
						associatedWith: 'forum',
					},
				},
			},
		},
		Editor: {
			syncable: true,
			name: 'Editor',
			pluralName: 'Editors',
			attributes: [
				{
					type: 'model',
					properties: {},
				},
			],
			fields: {
				id: {
					name: 'id',
					isArray: false,
					type: 'ID',
					isRequired: true,
					attributes: [],
				},
				name: {
					name: 'name',
					isArray: false,
					type: 'String',
					isRequired: true,
					attributes: [],
				},
				forums: {
					name: 'forums',
					isArray: true,
					type: {
						model: 'ForumEditorJoin',
					},
					isRequired: false,
					attributes: [],
					association: {
						connectionType: 'HAS_MANY',
						associatedWith: 'editor',
					},
				},
			},
		},
		ForumEditorJoin: {
			syncable: true,
			name: 'ForumEditorJoin',
			pluralName: 'ForumEditorJoins',
			attributes: [
				{
					type: 'model',
					properties: {},
				},
				{
					type: 'key',
					properties: {
						name: 'byEditor',
						fields: ['editorID', 'forumID'],
					},
				},
				{
					type: 'key',
					properties: {
						name: 'byForum',
						fields: ['forumID', 'editorID'],
					},
				},
			],
			fields: {
				id: {
					name: 'id',
					isArray: false,
					type: 'ID',
					isRequired: true,
					attributes: [],
				},
				editor: {
					name: 'editor',
					isArray: false,
					type: {
						model: 'Editor',
					},
					isRequired: false,
					attributes: [],
					association: {
						connectionType: 'BELONGS_TO',
						targetName: 'editorID',
					},
				},
				forum: {
					name: 'forum',
					isArray: false,
					type: {
						model: 'Forum',
					},
					isRequired: false,
					attributes: [],
					association: {
						connectionType: 'BELONGS_TO',
						targetName: 'forumID',
					},
				},
			},
		},
		BlogOwner: {
			syncable: true,
			name: 'BlogOwner',
			pluralName: 'BlogOwners',
			attributes: [
				{
					type: 'model',
					properties: {},
				},
			],
			fields: {
				name: {
					name: 'name',
					isArray: false,
					type: 'String',
					isRequired: true,
					attributes: [],
				},
				id: {
					name: 'id',
					isArray: false,
					type: 'ID',
					isRequired: true,
					attributes: [],
				},
				blog: {
					name: 'blog',
					isArray: false,
					type: {
						model: 'Blog',
					},
					isRequired: false,
					attributes: [],
					association: {
						connectionType: 'HAS_ONE',
						associatedWith: 'owner',
					},
				},
			},
		},
		Person: {
			syncable: true,
			name: 'Person',
			pluralName: 'Persons',
			attributes: [
				{
					type: 'model',
					properties: {},
				},
			],
			fields: {
				id: {
					name: 'id',
					isArray: false,
					type: 'ID',
					isRequired: true,
					attributes: [],
				},
				firstName: {
					name: 'firstName',
					isArray: false,
					type: 'String',
					isRequired: true,
					attributes: [],
				},
				lastName: {
					name: 'lastName',
					isArray: false,
					type: 'String',
					isRequired: true,
					attributes: [],
				},
				username: {
					name: 'username',
					isArray: false,
					type: 'String',
					isRequired: false,
					attributes: [],
				},
			},
		},
		Team: {
			syncable: true,
			name: 'Team',
			pluralName: 'Teams',
			attributes: [
				{
					type: 'model',
					properties: {},
				},
			],
			fields: {
				id: {
					name: 'id',
					isArray: false,
					type: 'ID',
					isRequired: true,
					attributes: [],
				},
				name: {
					name: 'name',
					isArray: false,
					type: 'String',
					isRequired: true,
					attributes: [],
				},
			},
		},
		Project: {
			syncable: true,
			name: 'Project',
			pluralName: 'Projects',
			attributes: [
				{
					type: 'model',
					properties: {},
				},
			],
			fields: {
				name: {
					name: 'name',
					isArray: false,
					type: 'String',
					isRequired: true,
					attributes: [],
				},
				id: {
					name: 'id',
					isArray: false,
					type: 'ID',
					isRequired: true,
					attributes: [],
				},
				teamID: {
					name: 'teamID',
					isArray: false,
					type: 'ID',
					isRequired: false,
					attributes: [],
				},
				team: {
					name: 'team',
					isArray: false,
					type: {
						model: 'Team',
					},
					isRequired: false,
					attributes: [],
					association: {
						connectionType: 'HAS_ONE',
						associatedWith: 'id',
						targetName: 'teamID',
					},
				},
			},
		},
		LeftItem: {
			name: 'LeftItem',
			fields: {
				id: {
					name: 'id',
					isArray: false,
					type: 'ID',
					isRequired: true,
					attributes: [],
				},
				leftName: {
					name: 'leftName',
					isArray: false,
					type: 'String',
					isRequired: true,
					attributes: [],
				},
				right: {
					name: 'right',
					isArray: true,
					type: {
						model: 'LeftRight',
					},
					isRequired: false,
					attributes: [],
					isArrayNullable: true,
					association: {
						// v2.1 manyToMany
						// connectionType: 'HAS_MANY',

						// v2.2 manyToMany
						connectionType: 'MANY_TO_MANY',
						associatedWith: 'LeftItem',

						// the field on the join table that points to the *other* model.
						connectedTo: 'RightItem',
					},
				},
				createdAt: {
					name: 'createdAt',
					isArray: false,
					type: 'AWSDateTime',
					isRequired: false,
					attributes: [],
					isReadOnly: true,
				},
				updatedAt: {
					name: 'updatedAt',
					isArray: false,
					type: 'AWSDateTime',
					isRequired: false,
					attributes: [],
					isReadOnly: true,
				},
			},
			syncable: true,
			pluralName: 'LeftItems',
			attributes: [
				{
					type: 'model',
					properties: {},
				},
			],
		},
		RightItem: {
			name: 'RightItem',
			fields: {
				id: {
					name: 'id',
					isArray: false,
					type: 'ID',
					isRequired: true,
					attributes: [],
				},
				rightName: {
					name: 'rightName',
					isArray: false,
					type: 'String',
					isRequired: true,
					attributes: [],
				},
				left: {
					name: 'left',
					isArray: true,
					type: {
						model: 'LeftRight',
					},
					isRequired: false,
					attributes: [],
					isArrayNullable: true,
					association: {
						// v2.1 manyToMany
						// connectionType: 'HAS_MANY',

						// v2.2 manyToMany
						connectionType: 'MANY_TO_MANY',
						associatedWith: 'RightItem',

						// the field on the join table that points to the *other* model.
						connectedTo: 'LeftItem',
					},
				},
				createdAt: {
					name: 'createdAt',
					isArray: false,
					type: 'AWSDateTime',
					isRequired: false,
					attributes: [],
					isReadOnly: true,
				},
				updatedAt: {
					name: 'updatedAt',
					isArray: false,
					type: 'AWSDateTime',
					isRequired: false,
					attributes: [],
					isReadOnly: true,
				},
			},
			syncable: true,
			pluralName: 'RightItems',
			attributes: [
				{
					type: 'model',
					properties: {},
				},
			],
		},
		LeftRight: {
			name: 'LeftRight',
			fields: {
				id: {
					name: 'id',
					isArray: false,
					type: 'ID',
					isRequired: true,
					attributes: [],
				},
				LeftItem: {
					name: 'LeftItem',
					isArray: false,
					type: {
						model: 'LeftItem',
					},
					isRequired: true,
					attributes: [],
					association: {
						connectionType: 'BELONGS_TO',
						targetName: 'LeftItemID',
					},
				},
				RightItem: {
					name: 'RightItem',
					isArray: false,
					type: {
						model: 'RightItem',
					},
					isRequired: true,
					attributes: [],
					association: {
						connectionType: 'BELONGS_TO',
						targetName: 'RightItemID',
					},
				},
				createdAt: {
					name: 'createdAt',
					isArray: false,
					type: 'AWSDateTime',
					isRequired: false,
					attributes: [],
					isReadOnly: true,
				},
				updatedAt: {
					name: 'updatedAt',
					isArray: false,
					type: 'AWSDateTime',
					isRequired: false,
					attributes: [],
					isReadOnly: true,
				},
			},
			syncable: true,
			pluralName: 'LeftRights',
			attributes: [
				{
					type: 'model',
					properties: {},
				},
			],
		},
	},
	enums: {},
	nonModels: {
		PostMetadata: {
			name: 'PostMetadata',
			fields: {
				author: {
					name: 'rating',
					isArray: false,
					type: 'Int',
					isRequired: true,
					attributes: [],
				},
				tags: {
					name: 'tags',
					isArray: true,
					type: 'String',
					isRequired: false,
					attributes: [],
				},
				nested: {
					name: 'nested',
					isArray: false,
					type: {
						nonModel: 'Nested',
					},
					isRequired: true,
					attributes: [],
				},
			},
		},
		Nested: {
			name: 'Nested',
			fields: {
				aField: {
					name: 'aField',
					isArray: false,
					type: 'String',
					isRequired: true,
					attributes: [],
				},
			},
		},
	},
	version: 'a66372d29356c40e7cd29e41527cead7',
};

export const implicitOwnerSchema = {
	models: {
		Post: {
			name: 'Post',
			fields: {
				id: {
					name: 'id',
					isArray: false,
					type: 'ID',
					isRequired: true,
					attributes: [],
				},
				title: {
					name: 'title',
					isArray: false,
					type: 'String',
					isRequired: true,
					attributes: [],
				},
			},
			syncable: true,
			pluralName: 'Posts',
			attributes: [
				{
					type: 'model',
					properties: {},
				},
				{
					type: 'auth',
					properties: {
						rules: [
							{
								provider: 'userPools',
								ownerField: 'owner',
								allow: 'owner',
								identityClaim: 'cognito:username',
								operations: ['create', 'update', 'delete', 'read'],
							},
						],
					},
				},
			],
		},
	},
	enums: {},
	nonModels: {},
	version: '0e29e95012de2d43cf8329d731a5cfb2',
};

export const explicitOwnerSchema = {
	models: {
		Post: {
			name: 'Post',
			fields: {
				id: {
					name: 'id',
					isArray: false,
					type: 'ID',
					isRequired: true,
					attributes: [],
				},
				title: {
					name: 'title',
					isArray: false,
					type: 'String',
					isRequired: true,
					attributes: [],
				},
				owner: {
					name: 'owner',
					isArray: false,
					type: 'String',
					isRequired: false,
					attributes: [],
				},
			},
			syncable: true,
			pluralName: 'Posts',
			attributes: [
				{
					type: 'model',
					properties: {},
				},
				{
					type: 'auth',
					properties: {
						rules: [
							{
								provider: 'userPools',
								ownerField: 'owner',
								allow: 'owner',
								identityClaim: 'cognito:username',
								operations: ['create', 'update', 'delete', 'read'],
							},
						],
					},
				},
			],
		},
	},
	enums: {},
	nonModels: {},
	version: '0e29e95012de2d43cf8329d731a5cfb2',
};

export const groupSchema = {
	models: {
		Post: {
			name: 'Post',
			fields: {
				id: {
					name: 'id',
					isArray: false,
					type: 'ID',
					isRequired: true,
					attributes: [],
				},
				title: {
					name: 'title',
					isArray: false,
					type: 'String',
					isRequired: true,
					attributes: [],
				},
			},
			syncable: true,
			pluralName: 'Posts',
			attributes: [
				{
					type: 'model',
					properties: {},
				},
				{
					type: 'auth',
					properties: {
						rules: [
							{
								groupClaim: 'cognito:groups',
								provider: 'userPools',
								allow: 'groups',
								groups: ['Admin'],
								operations: ['create', 'update', 'delete', 'read'],
							},
						],
					},
				},
			],
		},
	},
	enums: {},
	nonModels: {},
	version: '0e29e95012de2d43cf8329d731a5cfb2',
};
