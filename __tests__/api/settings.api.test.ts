/**
 * 🧪 SETTINGS API TESTS
 * Testes completos para /api/settings/*
 * 
 * Cobre 8 endpoints:
 * - PUT /api/settings/name (204)
 * - PUT /api/settings/avatar (204)
 * - POST /api/settings/change-email (204)
 * - GET /api/settings/preferences (200)
 * - PUT /api/settings/preferences (204)
 * - DELETE /api/settings/sessions (204)
 * - POST /api/settings/delete-account (204)
 * - POST /api/settings/subscription/cancel (204)
 * 
 * Valida:
 * - ✅ Autenticação obrigatória (todas)
 * - ✅ 204 No Content em POST/PUT/DELETE
 * - ✅ Validação Zod robusta
 * - ✅ Segurança (userId da sessão)
 */

import { PUT as nameUpdate } from '@/app/api/settings/name/route';
import { PUT as avatarUpdate } from '@/app/api/settings/avatar/route';
import { POST as changeEmail } from '@/app/api/settings/change-email/route';
import { GET as preferencesGet, PUT as preferencesUpdate } from '@/app/api/settings/preferences/route';
import { DELETE as sessionsDelete } from '@/app/api/settings/sessions/route';
import { POST as deleteAccount } from '@/app/api/settings/delete-account/route';
import { POST as cancelSubscription } from '@/app/api/settings/subscription/cancel/route';
import { prisma } from '@/lib/prisma';

import {
    mockAuthAuthenticated,
    mockAuthUnauthenticated,
    clearAuthMocks,
    createAuthHeaders,
    createUnauthHeaders,
    expectUnauthorized,
    expectNoContent,
    expectOk,
} from '../helpers/auth.helper';

import {
    expectOnlyFields,
    expectValidJson,
    expectEmptyBody,
    expectErrorStructure,
} from '../helpers/payload.helper';

import {
    createGetRequest,
    createPostRequest,
    createPutRequest,
    createDeleteRequest,
    extractJson,
} from '../helpers/request.helper';

// Mock Prisma
jest.mock('@/lib/prisma', () => ({
    prisma: {
        user: {
            update: jest.fn(),
            delete: jest.fn(),
            findUnique: jest.fn(),
        },
        userPreferences: {
            findUnique: jest.fn(),
            upsert: jest.fn(),
        },
        session: {
            deleteMany: jest.fn(),
        },
        subscription: {
            update: jest.fn(),
            findUnique: jest.fn(),
        },
        watchHistory: {
            deleteMany: jest.fn(),
        },
        watchlist: {
            deleteMany: jest.fn(),
        },
        familyMember: {
            deleteMany: jest.fn(),
        },
        family: {
            delete: jest.fn(),
        },
        $transaction: jest.fn(),
    },
}));

describe('⚙️ Settings API Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    afterEach(() => {
        clearAuthMocks();
    });

    // ========================================
    // PUT /api/settings/name
    // ========================================
    describe('PUT /api/settings/name', () => {
        it('❌ Deve retornar 401 se não autenticado', async () => {
            mockAuthUnauthenticated();

            const request = createPutRequest(
                '/api/settings/name',
                { name: 'Novo Nome' },
                createUnauthHeaders()
            );
            const response = await nameUpdate(request);

            expectUnauthorized(response);
        });

        it('✅ Deve retornar 204 No Content ao atualizar nome', async () => {
            mockAuthAuthenticated();

            (prisma.user.update as jest.Mock).mockResolvedValue({
                id: 'test-user-id-123',
                name: 'Novo Nome',
            });

            const request = createPutRequest(
                '/api/settings/name',
                { name: 'Novo Nome' },
                createAuthHeaders()
            );
            const response = await nameUpdate(request);

            await expectEmptyBody(response);
        });

        it('❌ Deve validar name obrigatório', async () => {
            mockAuthAuthenticated();

            const request = createPutRequest(
                '/api/settings/name',
                {},
                createAuthHeaders()
            );
            const response = await nameUpdate(request);

            expect(response.status).toBe(400);
        });

        it('❌ Deve validar tamanho mínimo/máximo do nome', async () => {
            mockAuthAuthenticated();

            // Nome muito curto (< 2 caracteres)
            const request1 = createPutRequest(
                '/api/settings/name',
                { name: 'A' },
                createAuthHeaders()
            );
            const response1 = await nameUpdate(request1);
            expect(response1.status).toBe(400);

            // Nome muito longo (> 100 caracteres)
            const request2 = createPutRequest(
                '/api/settings/name',
                { name: 'A'.repeat(101) },
                createAuthHeaders()
            );
            const response2 = await nameUpdate(request2);
            expect(response2.status).toBe(400);
        });

        it('✅ Deve atualizar apenas do usuário autenticado', async () => {
            mockAuthAuthenticated();

            (prisma.user.update as jest.Mock).mockResolvedValue({ id: 'u1' });

            const request = createPutRequest(
                '/api/settings/name',
                { name: 'Novo Nome' },
                createAuthHeaders()
            );
            await nameUpdate(request);

            expect(prisma.user.update).toHaveBeenCalledWith({
                where: { id: 'test-user-id-123' }, // ✅ Da sessão
                data: { name: 'Novo Nome' },
            });
        });
    });

    // ========================================
    // PUT /api/settings/avatar
    // ========================================
    describe('PUT /api/settings/avatar', () => {
        it('❌ Deve retornar 401 se não autenticado', async () => {
            mockAuthUnauthenticated();

            const request = createPutRequest(
                '/api/settings/avatar',
                { avatarUrl: 'https://example.com/avatar.jpg' },
                createUnauthHeaders()
            );
            const response = await avatarUpdate(request);

            expectUnauthorized(response);
        });

        it('✅ Deve retornar 204 No Content ao atualizar avatar', async () => {
            mockAuthAuthenticated();

            (prisma.user.update as jest.Mock).mockResolvedValue({
                id: 'test-user-id-123',
            });

            const request = createPutRequest(
                '/api/settings/avatar',
                { avatarUrl: 'https://example.com/avatar.jpg' },
                createAuthHeaders()
            );
            const response = await avatarUpdate(request);

            await expectEmptyBody(response);
        });

        it('❌ Deve validar URL válida', async () => {
            mockAuthAuthenticated();

            const request = createPutRequest(
                '/api/settings/avatar',
                { avatarUrl: 'not-a-url' },
                createAuthHeaders()
            );
            const response = await avatarUpdate(request);

            expect(response.status).toBe(400);
        });

        it('✅ Deve aceitar null para remover avatar', async () => {
            mockAuthAuthenticated();

            (prisma.user.update as jest.Mock).mockResolvedValue({ id: 'u1' });

            const request = createPutRequest(
                '/api/settings/avatar',
                { avatarUrl: null },
                createAuthHeaders()
            );
            const response = await avatarUpdate(request);

            expectNoContent(response);
        });
    });

    // ========================================
    // POST /api/settings/change-email
    // ========================================
    describe('POST /api/settings/change-email', () => {
        it('❌ Deve retornar 401 se não autenticado', async () => {
            mockAuthUnauthenticated();

            const request = createPostRequest(
                '/api/settings/change-email',
                { newEmail: 'novo@example.com' },
                createUnauthHeaders()
            );
            const response = await changeEmail(request);

            expectUnauthorized(response);
        });

        it('✅ Deve retornar 204 No Content ao trocar email', async () => {
            mockAuthAuthenticated();

            (prisma.user.findUnique as jest.Mock).mockResolvedValue(null); // Email não existe
            (prisma.user.update as jest.Mock).mockResolvedValue({ id: 'u1' });

            const request = createPostRequest(
                '/api/settings/change-email',
                { newEmail: 'novo@example.com' },
                createAuthHeaders()
            );
            const response = await changeEmail(request);

            await expectEmptyBody(response);
        });

        it('❌ Deve validar formato de email', async () => {
            mockAuthAuthenticated();

            const request = createPostRequest(
                '/api/settings/change-email',
                { newEmail: 'email-invalido' },
                createAuthHeaders()
            );
            const response = await changeEmail(request);

            expect(response.status).toBe(400);
        });

        it('❌ Deve bloquear se email já existe', async () => {
            mockAuthAuthenticated();

            (prisma.user.findUnique as jest.Mock).mockResolvedValue({
                id: 'other-user-id',
                email: 'novo@example.com',
            });

            const request = createPostRequest(
                '/api/settings/change-email',
                { newEmail: 'novo@example.com' },
                createAuthHeaders()
            );
            const response = await changeEmail(request);

            expect(response.status).toBe(400);
            const data = await extractJson(response);
            expect(data.error).toContain('já está em uso');
        });
    });

    // ========================================
    // GET /api/settings/preferences
    // ========================================
    describe('GET /api/settings/preferences', () => {
        it('❌ Deve retornar 401 se não autenticado', async () => {
            mockAuthUnauthenticated();

            const request = createGetRequest('/api/settings/preferences', createUnauthHeaders());
            const response = await preferencesGet(request);

            expectUnauthorized(response);
        });

        it('✅ Deve retornar preferências do usuário', async () => {
            mockAuthAuthenticated();

            const mockPreferences = {
                language: 'pt-BR',
                emailNotifications: true,
                autoplay: false,
                theme: 'dark',
            };

            (prisma.user.findUnique as jest.Mock).mockResolvedValue({
                id: 'test-user-id-123',
                preferences: mockPreferences,
            });

            const request = createGetRequest('/api/settings/preferences', createAuthHeaders());
            const response = await preferencesGet(request);

            expectOk(response);
            const data = await expectValidJson(response);

            expect(data).toHaveProperty('preferences');
            expect(data.preferences).toEqual(mockPreferences);
        });

        it('✅ Deve retornar preferências padrão se não configuradas', async () => {
            mockAuthAuthenticated();

            (prisma.user.findUnique as jest.Mock).mockResolvedValue({
                id: 'test-user-id-123',
                preferences: null,
            });

            const request = createGetRequest('/api/settings/preferences', createAuthHeaders());
            const response = await preferencesGet(request);

            expectOk(response);
            const data = await expectValidJson(response);

            expect(data.preferences).toBeDefined();
        });
    });

    // ========================================
    // PUT /api/settings/preferences
    // ========================================
    describe('PUT /api/settings/preferences', () => {
        it('❌ Deve retornar 401 se não autenticado', async () => {
            mockAuthUnauthenticated();

            const request = createPutRequest(
                '/api/settings/preferences',
                { language: 'en-US' },
                createUnauthHeaders()
            );
            const response = await preferencesUpdate(request);

            expectUnauthorized(response);
        });

        it('✅ Deve retornar 204 No Content ao atualizar preferências', async () => {
            mockAuthAuthenticated();

            (prisma.user.update as jest.Mock).mockResolvedValue({ id: 'u1' });

            const request = createPutRequest(
                '/api/settings/preferences',
                {
                    language: 'en-US',
                    emailNotifications: false,
                    autoplay: true,
                },
                createAuthHeaders()
            );
            const response = await preferencesUpdate(request);

            await expectEmptyBody(response);
        });

        it('❌ Deve validar valores de preferências', async () => {
            mockAuthAuthenticated();

            // Language inválida
            const request = createPutRequest(
                '/api/settings/preferences',
                { language: 'invalid-lang' },
                createAuthHeaders()
            );
            const response = await preferencesUpdate(request);

            expect(response.status).toBe(400);
        });
    });

    // ========================================
    // DELETE /api/settings/sessions
    // ========================================
    describe('DELETE /api/settings/sessions', () => {
        it('❌ Deve retornar 401 se não autenticado', async () => {
            mockAuthUnauthenticated();

            const request = createDeleteRequest(
                '/api/settings/sessions',
                { sessionId: 'session-123' },
                createUnauthHeaders()
            );
            const response = await sessionsDelete(request);

            expectUnauthorized(response);
        });

        it('✅ Deve retornar 204 No Content ao deletar sessão', async () => {
            mockAuthAuthenticated();

            (prisma.session.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });

            const request = createDeleteRequest(
                '/api/settings/sessions',
                { sessionId: 'session-123' },
                createAuthHeaders()
            );
            const response = await sessionsDelete(request);

            await expectEmptyBody(response);
        });

        it('✅ Deve deletar apenas sessões do usuário autenticado', async () => {
            mockAuthAuthenticated();

            (prisma.session.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });

            const request = createDeleteRequest(
                '/api/settings/sessions',
                { sessionId: 'session-123' },
                createAuthHeaders()
            );
            await sessionsDelete(request);

            expect(prisma.session.deleteMany).toHaveBeenCalledWith({
                where: {
                    id: 'session-123',
                    userId: 'test-user-id-123', // ✅ Da sessão
                },
            });
        });

        it('❌ Deve validar sessionId obrigatório', async () => {
            mockAuthAuthenticated();

            const request = createDeleteRequest(
                '/api/settings/sessions',
                {},
                createAuthHeaders()
            );
            const response = await sessionsDelete(request);

            expect(response.status).toBe(400);
        });
    });

    // ========================================
    // POST /api/settings/delete-account
    // ========================================
    describe('POST /api/settings/delete-account', () => {
        it('❌ Deve retornar 401 se não autenticado', async () => {
            mockAuthUnauthenticated();

            const request = createPostRequest(
                '/api/settings/delete-account',
                { confirmation: 'DELETE' },
                createUnauthHeaders()
            );
            const response = await deleteAccount(request);

            expectUnauthorized(response);
        });

        it('✅ Deve retornar 204 No Content ao deletar conta', async () => {
            mockAuthAuthenticated();

            (prisma.$transaction as jest.Mock).mockImplementation(async (callback: any) => {
                return callback(prisma);
            });

            (prisma.watchHistory.deleteMany as jest.Mock).mockResolvedValue({ count: 5 });
            (prisma.watchlist.deleteMany as jest.Mock).mockResolvedValue({ count: 3 });
            (prisma.familyMember.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });
            (prisma.family.delete as jest.Mock).mockResolvedValue({ id: 'f1' });
            (prisma.user.delete as jest.Mock).mockResolvedValue({ id: 'u1' });

            const request = createPostRequest(
                '/api/settings/delete-account',
                { confirmation: 'DELETE' },
                createAuthHeaders()
            );
            const response = await deleteAccount(request);

            await expectEmptyBody(response);
        });

        it('❌ Deve validar confirmation obrigatória', async () => {
            mockAuthAuthenticated();

            const request = createPostRequest(
                '/api/settings/delete-account',
                {},
                createAuthHeaders()
            );
            const response = await deleteAccount(request);

            expect(response.status).toBe(400);
        });

        it('❌ Deve validar confirmation = "DELETE"', async () => {
            mockAuthAuthenticated();

            const request = createPostRequest(
                '/api/settings/delete-account',
                { confirmation: 'wrong' },
                createAuthHeaders()
            );
            const response = await deleteAccount(request);

            expect(response.status).toBe(400);
        });

        it('✅ Deve deletar em transação (all or nothing)', async () => {
            mockAuthAuthenticated();

            (prisma.$transaction as jest.Mock).mockImplementation(async (callback: any) => {
                return callback(prisma);
            });

            const request = createPostRequest(
                '/api/settings/delete-account',
                { confirmation: 'DELETE' },
                createAuthHeaders()
            );
            await deleteAccount(request);

            expect(prisma.$transaction).toHaveBeenCalled();
        });
    });

    // ========================================
    // POST /api/settings/subscription/cancel
    // ========================================
    describe('POST /api/settings/subscription/cancel', () => {
        it('❌ Deve retornar 401 se não autenticado', async () => {
            mockAuthUnauthenticated();

            const request = createPostRequest(
                '/api/settings/subscription/cancel',
                {},
                createUnauthHeaders()
            );
            const response = await cancelSubscription(request);

            expectUnauthorized(response);
        });

        it('✅ Deve retornar 204 No Content ao cancelar assinatura', async () => {
            mockAuthAuthenticated();

            (prisma.subscription.findUnique as jest.Mock).mockResolvedValue({
                id: 'sub-1',
                userId: 'test-user-id-123',
                status: 'active',
            });

            (prisma.subscription.update as jest.Mock).mockResolvedValue({
                id: 'sub-1',
                status: 'canceled',
            });

            const request = createPostRequest(
                '/api/settings/subscription/cancel',
                {},
                createAuthHeaders()
            );
            const response = await cancelSubscription(request);

            await expectEmptyBody(response);
        });

        it('❌ Deve retornar 404 se não tem assinatura', async () => {
            mockAuthAuthenticated();

            (prisma.subscription.findUnique as jest.Mock).mockResolvedValue(null);

            const request = createPostRequest(
                '/api/settings/subscription/cancel',
                {},
                createAuthHeaders()
            );
            const response = await cancelSubscription(request);

            expect(response.status).toBe(404);
        });

        it('✅ Deve cancelar apenas assinatura do usuário autenticado', async () => {
            mockAuthAuthenticated();

            (prisma.subscription.findUnique as jest.Mock).mockResolvedValue({
                id: 'sub-1',
                userId: 'test-user-id-123',
            });

            (prisma.subscription.update as jest.Mock).mockResolvedValue({
                id: 'sub-1',
            });

            const request = createPostRequest(
                '/api/settings/subscription/cancel',
                {},
                createAuthHeaders()
            );
            await cancelSubscription(request);

            expect(prisma.subscription.findUnique).toHaveBeenCalledWith({
                where: { userId: 'test-user-id-123' }, // ✅ Da sessão
            });
        });
    });

    // ========================================
    // 🔒 TESTES DE SEGURANÇA
    // ========================================
    describe('🔒 Security Tests', () => {
        it('✅ TODAS as APIs devem usar userId da sessão (nunca do body)', async () => {
            mockAuthAuthenticated();

            const apis = [
                {
                    name: 'name update',
                    fn: nameUpdate,
                    request: createPutRequest('/api/settings/name', { name: 'Test' }, createAuthHeaders()),
                },
                {
                    name: 'avatar update',
                    fn: avatarUpdate,
                    request: createPutRequest('/api/settings/avatar', { avatarUrl: 'https://example.com/a.jpg' }, createAuthHeaders()),
                },
            ];

            for (const api of apis) {
                jest.clearAllMocks();
                (prisma.user.update as jest.Mock).mockResolvedValue({ id: 'u1' });

                await api.fn(api.request);

                expect(prisma.user.update).toHaveBeenCalledWith(
                    expect.objectContaining({
                        where: { id: 'test-user-id-123' }, // ✅ Da sessão
                    })
                );
            }
        });

        it('❌ Tentar injetar userId malicioso deve ser ignorado', async () => {
            mockAuthAuthenticated();

            (prisma.user.update as jest.Mock).mockResolvedValue({ id: 'u1' });

            // Tentar injetar userId no body
            const request = createPutRequest(
                '/api/settings/name',
                {
                    name: 'Test',
                    userId: 'hacker-user-id', // ❌ Deve ser ignorado
                },
                createAuthHeaders()
            );
            await nameUpdate(request);

            // Validar que usou userId da sessão
            expect(prisma.user.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: 'test-user-id-123' }, // ✅ Da sessão
                })
            );
        });
    });
});
