/*
 * Copyright 2017-2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance with
 * the License. A copy of the License is located at
 *
 *     http://aws.amazon.com/apache2.0/
 *
 * or in the "license" file accompanying this file. This file is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR
 * CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions
 * and limitations under the License.
 */

export { default } from './InAppMessaging';
export { AWSPinpointProvider } from './Providers';
export { AWSPinpointUserInfo } from './Providers/AWSPinpointProvider/types';
export {
	InAppMessage,
	InAppMessageAction,
	InAppMessageButton,
	InAppMessageContent,
	InAppMessageImage,
	InAppMessageInteractionEvent,
	InAppMessageLayout,
	InAppMessageStyle,
	InAppMessageTextAlign,
	InAppMessagingConfig,
	InAppMessagingEvent,
	UserInfo,
} from './types';
