/**
 * 🔐 AUTH TEST HELPERS
 * Helpers para autenticação em testes de API
 */

import { auth } from '@/lib/auth';

/**
 * Mock de sessão autenticada válida
 */
export const mockAuthenticatedSession = {
    user: {
        id: 'test-user-id-123',
        email: 'test@example.com',
        name: 'Test User',
        emailVerified: true,
        image: null,
        maxScreens: 1,
        trialUsed: false,
        avatarIcon: '👤',
        avatarColor: '#3B82F6',
        createdAt: new Date(),
        updatedAt: new Date(),
    },
    session: {
        id: 'test-session-id-123',
        userId: 'test-user-id-123',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 dias
        token: 'mock-session-token',
        ipAddress: '127.0.0.1',
        userAgent: 'jest-test-agent',
        createdAt: new Date(),
        updatedAt: new Date(),
    },
};

/**
 * Mock de sessão não autenticada (null)
 */
export const mockUnauthenticatedSession = null;

/**
 * Mock Better Auth para retornar sessão autenticada
 */
export function mockAuthAuthenticated() {
    jest.spyOn(auth.api, 'getSession').mockResolvedValue(mockAuthenticatedSession);
}

/**
 * Mock Better Auth para retornar sessão não autenticada
 */
export function mockAuthUnauthenticated() {
    jest.spyOn(auth.api, 'getSession').mockResolvedValue(mockUnauthenticatedSession);
}

/**
 * Mock Better Auth para retornar sessão customizada
 */
export function mockAuthCustomSession(session: any) {
    jest.spyOn(auth.api, 'getSession').mockResolvedValue(session);
}

/**
 * Limpa todos os mocks de autenticação
 */
export function clearAuthMocks() {
    jest.restoreAllMocks();
}

/**
 * Cria headers de request simulando cookies do Better Auth
 */
export function createAuthHeaders(): Headers {
    const headers = new Headers();
    headers.set('cookie', 'better-auth.session_token=mock-token');
    headers.set('content-type', 'application/json');
    return headers;
}

/**
 * Cria headers de request sem autenticação
 */
export function createUnauthHeaders(): Headers {
    const headers = new Headers();
    headers.set('content-type', 'application/json');
    return headers;
}

/**
 * Valida que a resposta da API tem status 401 (Unauthorized)
 */
export function expectUnauthorized(response: Response) {
    expect(response.status).toBe(401);
}

/**
 * Valida que a resposta da API tem status 403 (Forbidden)
 */
export function expectForbidden(response: Response) {
    expect(response.status).toBe(403);
}

/**
 * Valida que a resposta da API tem status 400 (Bad Request)
 */
export function expectBadRequest(response: Response) {
    expect(response.status).toBe(400);
}

/**
 * Valida que a resposta da API tem status 200 (OK)
 */
export function expectOk(response: Response) {
    expect(response.status).toBe(200);
}

/**
 * Valida que a resposta da API tem status 204 (No Content)
 */
export function expectNoContent(response: Response) {
    expect(response.status).toBe(204);
}

/**
 * Valida que a resposta da API tem status 201 (Created)
 */
export function expectCreated(response: Response) {
    expect(response.status).toBe(201);
}
