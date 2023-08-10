import { AmplifyError, ErrorParams } from '@aws-amplify/core';

export class StorageError extends AmplifyError {
	constructor(params: ErrorParams) {
		super(params);

		// TODO: Delete the following 2 lines after we change the build target to >= es2015
		this.constructor = StorageError;
		Object.setPrototypeOf(this, StorageError.prototype);
	}
}