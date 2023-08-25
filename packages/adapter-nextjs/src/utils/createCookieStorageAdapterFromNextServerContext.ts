// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { NextRequest, NextResponse } from 'next/server';
import { NextServer } from '../types';
import {
	AmplifyServerContextError,
	CookieStorage,
} from '@aws-amplify/core/internals/adapter-core';
import { IncomingMessage, ServerResponse } from 'http';

export const DATE_IN_THE_PAST = new Date(0);

export const createCookieStorageAdapterFromNextServerContext = (
	context: NextServer.Context
): CookieStorage.Adapter => {
	const { request, response } = context as
		| NextServer.NextRequestAndNextResponseContext
		| NextServer.NextRequestAndResponseContext;

	if (request instanceof NextRequest && response) {
		if (response instanceof NextResponse) {
			return createCookieStorageAdapterFromNextRequestAndNextResponse(
				request,
				response
			);
		} else {
			return createCookieStorageAdapterFromNextRequestAndHttpResponse(
				request,
				response
			);
		}
	}

	const { cookies } = context as
		| NextServer.ServerComponentContext
		| NextServer.ServerActionContext;

	if (typeof cookies === 'function') {
		return createCookieStorageAdapterFromNextCookies(cookies);
	}

	const { request: req, response: res } =
		context as NextServer.GetServerSidePropsContext;

	if (req instanceof IncomingMessage && res instanceof ServerResponse) {
		return createCookieStorageAdapterFromGetServerSidePropsContext(req, res);
	}

	// This should not happen normally.
	throw new AmplifyServerContextError({
		message:
			'Attempted to create cookie storage adapter from an unsupported Next.js server context.',
	});
};

const createCookieStorageAdapterFromNextRequestAndNextResponse = (
	request: NextRequest,
	response: NextResponse
): CookieStorage.Adapter => {
	const readonlyCookieStore = request.cookies;
	const mutableCookieStore = response.cookies;

	return {
		get: readonlyCookieStore.get.bind(readonlyCookieStore),
		getAll: readonlyCookieStore.getAll.bind(readonlyCookieStore),
		set: mutableCookieStore.set.bind(mutableCookieStore),
		delete: mutableCookieStore.delete.bind(mutableCookieStore),
	};
};

const createCookieStorageAdapterFromNextRequestAndHttpResponse = (
	request: NextRequest,
	response: Response
): CookieStorage.Adapter => {
	const readonlyCookieStore = request.cookies;
	const mutableCookieStore = createMutableCookieStoreFromHeaders(
		response.headers
	);

	return {
		get: readonlyCookieStore.get.bind(readonlyCookieStore),
		getAll: readonlyCookieStore.getAll.bind(readonlyCookieStore),
		...mutableCookieStore,
	};
};

const createCookieStorageAdapterFromNextCookies = (
	cookies: NextServer.ServerComponentContext['cookies']
): CookieStorage.Adapter => {
	const cookieStore = cookies();

	// When Next cookies() is called in a server component, it returns a readonly
	// cookie store. Hence calling set and delete throws an error. However,
	// cookies() returns a mutable cookie store when called in a server action.
	// We have no way to detect which one is returned, so we try to call set and delete
	// and safely ignore the error if it is thrown.
	const setFunc: CookieStorage.Adapter['set'] = (name, value, options) => {
		try {
			cookieStore.set(name, value, options);
		} catch {
			// no-op
		}
	};

	const deleteFunc: CookieStorage.Adapter['delete'] = name => {
		try {
			cookieStore.delete(name);
		} catch {
			// no-op
		}
	};

	return {
		get: cookieStore.get.bind(cookieStore),
		getAll: cookieStore.getAll.bind(cookieStore),
		set: setFunc,
		delete: deleteFunc,
	};
};

const createCookieStorageAdapterFromGetServerSidePropsContext = (
	request: NextServer.GetServerSidePropsContext['request'],
	response: NextServer.GetServerSidePropsContext['response']
): CookieStorage.Adapter => {
	const cookiesMap = { ...request.cookies };
	const allCookies = Object.entries(cookiesMap).map(([name, value]) => ({
		name,
		value,
	}));

	return {
		get(name) {
			const value = cookiesMap[name];
			return value
				? {
						name,
						value,
				  }
				: undefined;
		},
		getAll() {
			return allCookies;
		},
		set(name, value, options) {
			response.setHeader(
				'Set-Cookie',
				`${name}=${value};${options ? serializeSetCookieOptions(options) : ''}`
			);
		},
		delete(name) {
			response.setHeader(
				'Set-Cookie',
				`${name}=;Expires=${DATE_IN_THE_PAST.toUTCString()}`
			);
		},
	};
};

const createMutableCookieStoreFromHeaders = (
	headers: Headers
): Pick<CookieStorage.Adapter, 'set' | 'delete'> => {
	const setFunc: CookieStorage.Adapter['set'] = (name, value, options) => {
		headers.append(
			'Set-Cookie',
			`${name}=${value};${options ? serializeSetCookieOptions(options) : ''}`
		);
	};
	const deleteFunc: CookieStorage.Adapter['delete'] = name => {
		headers.append(
			'Set-Cookie',
			`${name}=;Expires=${DATE_IN_THE_PAST.toUTCString()}`
		);
	};
	return {
		set: setFunc,
		delete: deleteFunc,
	};
};

const serializeSetCookieOptions = (
	options: CookieStorage.SetCookieOptions
): string => {
	const { expires, maxAge, domain, httpOnly, sameSite, secure } = options;
	const serializedOptions: string[] = [];
	if (domain) {
		serializedOptions.push(`Domain=${domain}`);
	}
	if (expires) {
		serializedOptions.push(`Expires=${expires.toUTCString()}`);
	}
	if (httpOnly) {
		serializedOptions.push(`HttpOnly`);
	}
	if (sameSite) {
		serializedOptions.push(`SameSite=${sameSite}`);
	}
	if (secure) {
		serializedOptions.push(`Secure`);
	}
	return serializedOptions.join(';');
};