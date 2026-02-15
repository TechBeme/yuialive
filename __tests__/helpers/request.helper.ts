/**
 * 🌐 REQUEST TEST HELPERS
 * Helpers para criar requisições HTTP em testes
 */

import { NextRequest } from 'next/server';

/**
 * Cria um NextRequest mock para GET
 */
export function createGetRequest(url: string, headers?: Headers): NextRequest {
    return new NextRequest(new URL(url, 'http://localhost:3000'), {
        method: 'GET',
        headers: headers || new Headers(),
    });
}

/**
 * Cria um NextRequest mock para POST
 */
export function createPostRequest(
    url: string,
    body: any,
    headers?: Headers
): NextRequest {
    return new NextRequest(new URL(url, 'http://localhost:3000'), {
        method: 'POST',
        headers: headers || new Headers({ 'content-type': 'application/json' }),
        body: JSON.stringify(body),
    });
}

/**
 * Cria um NextRequest mock para PUT
 */
export function createPutRequest(
    url: string,
    body: any,
    headers?: Headers
): NextRequest {
    return new NextRequest(new URL(url, 'http://localhost:3000'), {
        method: 'PUT',
        headers: headers || new Headers({ 'content-type': 'application/json' }),
        body: JSON.stringify(body),
    });
}

/**
 * Cria um NextRequest mock para DELETE
 */
export function createDeleteRequest(
    url: string,
    body?: any,
    headers?: Headers
): NextRequest {
    const options: any = {
        method: 'DELETE',
        headers: headers || new Headers({ 'content-type': 'application/json' }),
    };

    if (body) {
        options.body = JSON.stringify(body);
    }

    return new NextRequest(new URL(url, 'http://localhost:3000'), options);
}

/**
 * Adiciona query params a uma URL
 */
export function addQueryParams(baseUrl: string, params: Record<string, string>): string {
    const url = new URL(baseUrl, 'http://localhost:3000');
    Object.entries(params).forEach(([key, value]) => {
        url.searchParams.set(key, value);
    });
    return url.toString();
}

/**
 * Cria headers com Bearer token (para APIs internas)
 */
export function createBearerHeaders(token: string): Headers {
    const headers = new Headers();
    headers.set('authorization', `Bearer ${token}`);
    headers.set('content-type', 'application/json');
    return headers;
}

/**
 * Extrai JSON de uma Response
 */
export async function extractJson(response: Response): Promise<any> {
    try {
        return await response.json();
    } catch {
        return null;
    }
}

/**
 * Valida estrutura de paginação
 */
export function expectPaginationStructure(data: any) {
    expect(data).toHaveProperty('results');
    expect(data).toHaveProperty('page');
    expect(data).toHaveProperty('totalPages');
    expect(data).toHaveProperty('totalResults');
    expect(Array.isArray(data.results)).toBe(true);
    expect(typeof data.page).toBe('number');
    expect(typeof data.totalPages).toBe('number');
    expect(typeof data.totalResults).toBe('number');
}
