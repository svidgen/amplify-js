// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { Amplify } from '@aws-amplify/core';
import { APIValidationErrorCode, assertValidationError } from './errors';

/**
 * @internal
 */
export const resolveConfig = () => {
	// TODO V6
	const { region, defaultAuthMode, endpoint } =
		Amplify.getConfig().API?.AppSync ?? {};
	assertValidationError(!!endpoint, APIValidationErrorCode.NoAppId);
	assertValidationError(!!region, APIValidationErrorCode.NoRegion);
	assertValidationError(
		!!defaultAuthMode,
		APIValidationErrorCode.NoDefaultAuthMode
	);
	// TODO V6
	return { endpoint, region, defaultAuthMode };
};