// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { Amplify } from '@aws-amplify/core';
import { assertTokenProviderConfig } from '@aws-amplify/core/internals/utils';
import { AuthStandardAttributeKey, AuthDeliveryMedium } from '../../../types';
import { assertValidationError } from '../../../errors/utils/assertValidationError';
import { AuthValidationErrorCode } from '../../../errors/types/validation';
import { ResendSignUpCodeInput, ResendSignUpCodeOutput } from '../types';
import { getRegion } from '../utils/clients/CognitoIdentityProvider/utils';
import { resendConfirmationCode } from '../utils/clients/CognitoIdentityProvider';

/**
 * Resend the confirmation code while signing up
 *
 * @param input -  The ResendSignUpCodeInput object
 * @returns ResendSignUpCodeOutput
 * @throws service: {@link ResendConfirmationException } - Cognito service errors thrown when resending the code.
 * @throws validation: {@link AuthValidationErrorCode } - Validation errors thrown either username are not defined.
 * @throws AuthTokenConfigException - Thrown when the token provider config is invalid.
 */
export async function resendSignUpCode(
	input: ResendSignUpCodeInput
): Promise<ResendSignUpCodeOutput> {
	const username = input.username;
	assertValidationError(
		!!username,
		AuthValidationErrorCode.EmptySignUpUsername
	);
	const authConfig = Amplify.getConfig().Auth?.Cognito;
	assertTokenProviderConfig(authConfig);
	const clientMetadata = input.options?.serviceOptions?.clientMetadata;
	const { CodeDeliveryDetails } = await resendConfirmationCode(
		{ region: getRegion(authConfig.userPoolId) },
		{
			Username: username,
			ClientMetadata: clientMetadata,
			ClientId: authConfig.userPoolClientId,
		}
	);
	const { DeliveryMedium, AttributeName, Destination } = {
		...CodeDeliveryDetails,
	};
	return {
		destination: Destination as string,
		deliveryMedium: DeliveryMedium as AuthDeliveryMedium,
		attributeName: AttributeName
			? (AttributeName as AuthStandardAttributeKey)
			: undefined,
	};
}