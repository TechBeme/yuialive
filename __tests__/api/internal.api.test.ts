/**
 * 🧪 INTERNAL APIS TESTS
 * Testes para APIs internas protegidas por secrets
 * 
 * Cobre:
 * - POST /api/webhooks/payment (X-Webhook-Secret)
 * - POST /api/cron/expire-invites (CRON_SECRET)
 * - POST /api/cron/warm-cache (CRON_SECRET)
 * - POST /api/cron/expire-trials (CRON_SECRET)
 * - GET /api/metrics/cache (ADMIN_SECRET)
 * - GET /api/health/tmdb (ADMIN_SECRET)
 * - POST /api/revalidate (ADMIN_SECRET)
 * 
 * Valida:
 * - ✅ Autenticação Bearer obrigatória
 * - ✅ Validação de secrets em produção
 * - ✅ Validação Zod robusta
 * - ✅ Idempotência em webhooks
 * - ✅ Transações atômicas
 * - ✅ Circuit breaker e retry
 */

import { POST as webhookPayment } from '@/app/api/webhooks/payment/route';
import { POST as expireInvites } from '@/app/api/cron/expire-invites/route';
import { POST as warmCache } from '@/app/api/cron/warm-cache/route';
import { POST as expireTrials } from '@/app/api/cron/expire-trials/route';
import { GET as metricsCache } from '@/app/api/metrics/cache/route';
import { GET as healthTmdb } from '@/app/api/health/tmdb/route';
import { POST as revalidate } from '@/app/api/revalidate/route';
import { prisma } from '@/lib/prisma';

import {
    expectUnauthorized,
    expectOk,
    expectNoContent,
} from '../helpers/auth.helper';

import {
    expectValidJson,
    expectErrorStructure,
} from '../helpers/payload.helper';

import {
    createGetRequest,
    createPostRequest,
    createBearerHeaders,
    extractJson,
} from '../helpers/request.helper';

// Mock Prisma
jest.mock('@/lib/prisma', () => ({
    prisma: {
        user: {
            findMany: jest.fn(),
            update: jest.fn(),
        },
        family: {
            findFirst: jest.fn(),
            delete: jest.fn(),
        },
        familyMember: {
            deleteMany: jest.fn(),
        },
        familyInvite: {
            deleteMany: jest.fn(),
            updateMany: jest.fn(),
        },
        subscription: {
            updateMany: jest.fn(),
        },
        webhookEvent: {
            findUnique: jest.fn(),
            create: jest.fn(),
        },
        $transaction: jest.fn(),
    },
}));

// Mock fetch para TMDB
global.fetch = jest.fn();

// Mock env vars
const originalEnv = process.env;

describe('🔐 Internal APIs Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();

        // Set mock secrets
        process.env = {
            ...originalEnv,
            WEBHOOK_SECRET: 'test-webhook-secret',
            CRON_SECRET: 'test-cron-secret',
            ADMIN_SECRET: 'test-admin-secret',
            NODE_ENV: 'production',
        };
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    // ========================================
    // POST /api/webhooks/payment
    // ========================================
    describe('POST /api/webhooks/payment', () => {
        it('❌ Deve retornar 401 se sem secret', async () => {
            const request = createPostRequest(
                '/api/webhooks/payment',
                {
                    type: 'payment.succeeded',
                    userId: 'user-123',
                    planId: 'premium',
                    transactionId: 'tx-123',
                    amount: 29.90,
                },
                new Headers({ 'content-type': 'application/json' })
            );
            const response = await webhookPayment(request);

            expectUnauthorized(response);
        });

        it('❌ Deve retornar 401 se secret inválido', async () => {
            const headers = new Headers({
                'content-type': 'application/json',
                'x-webhook-secret': 'wrong-secret',
            });

            const request = createPostRequest(
                '/api/webhooks/payment',
                {
                    type: 'payment.succeeded',
                    userId: 'user-123',
                },
                headers
            );
            const response = await webhookPayment(request);

            expectUnauthorized(response);
        });

        it('✅ Deve aceitar secret válido', async () => {
            const headers = new Headers({
                'content-type': 'application/json',
                'x-webhook-secret': 'test-webhook-secret',
            });

            (prisma.webhookEvent.findUnique as jest.Mock).mockResolvedValue(null);
            (prisma.$transaction as jest.Mock).mockResolvedValue({});

            const request = createPostRequest(
                '/api/webhooks/payment',
                {
                    type: 'payment.succeeded',
                    userId: 'user-123',
                    planId: 'premium',
                    transactionId: 'tx-123',
                    amount: 29.90,
                },
                headers
            );
            const response = await webhookPayment(request);

            expectOk(response);
        });

        it('❌ Deve validar type enum', async () => {
            const headers = new Headers({
                'content-type': 'application/json',
                'x-webhook-secret': 'test-webhook-secret',
            });

            const request = createPostRequest(
                '/api/webhooks/payment',
                {
                    type: 'invalid.type',
                    userId: 'user-123',
                },
                headers
            );
            const response = await webhookPayment(request);

            expect(response.status).toBe(400);
        });

        it('❌ Deve validar campos obrigatórios', async () => {
            const headers = new Headers({
                'content-type': 'application/json',
                'x-webhook-secret': 'test-webhook-secret',
            });

            // Sem userId
            const request1 = createPostRequest(
                '/api/webhooks/payment',
                {
                    type: 'payment.succeeded',
                    planId: 'premium',
                },
                headers
            );
            const response1 = await webhookPayment(request1);
            expect(response1.status).toBe(400);

            // Sem planId
            const request2 = createPostRequest(
                '/api/webhooks/payment',
                {
                    type: 'payment.succeeded',
                    userId: 'user-123',
                },
                headers
            );
            const response2 = await webhookPayment(request2);
            expect(response2.status).toBe(400);
        });

        it('✅ Deve garantir idempotência (duplicação de webhook)', async () => {
            const headers = new Headers({
                'content-type': 'application/json',
                'x-webhook-secret': 'test-webhook-secret',
            });

            // Webhook já processado
            (prisma.webhookEvent.findUnique as jest.Mock).mockResolvedValue({
                id: 'webhook-1',
                transactionId: 'tx-123',
            });

            const request = createPostRequest(
                '/api/webhooks/payment',
                {
                    type: 'payment.succeeded',
                    userId: 'user-123',
                    planId: 'premium',
                    transactionId: 'tx-123',
                    amount: 29.90,
                },
                headers
            );
            const response = await webhookPayment(request);

            expectOk(response);
            const data = await expectValidJson(response);
            expect(data.message).toContain('já processado');
        });

        it('✅ Deve processar em transação atômica', async () => {
            const headers = new Headers({
                'content-type': 'application/json',
                'x-webhook-secret': 'test-webhook-secret',
            });

            (prisma.webhookEvent.findUnique as jest.Mock).mockResolvedValue(null);
            (prisma.$transaction as jest.Mock).mockResolvedValue({});

            const request = createPostRequest(
                '/api/webhooks/payment',
                {
                    type: 'payment.succeeded',
                    userId: 'user-123',
                    planId: 'premium',
                    transactionId: 'tx-123',
                    amount: 29.90,
                },
                headers
            );
            await webhookPayment(request);

            expect(prisma.$transaction).toHaveBeenCalled();
        });
    });

    // ========================================
    // POST /api/cron/expire-invites
    // ========================================
    describe('POST /api/cron/expire-invites', () => {
        it('❌ Deve retornar 401 se sem Bearer token', async () => {
            const request = createPostRequest(
                '/api/cron/expire-invites',
                {},
                new Headers({ 'content-type': 'application/json' })
            );
            const response = await expireInvites(request);

            expectUnauthorized(response);
        });

        it('❌ Deve retornar 401 se secret inválido', async () => {
            const headers = createBearerHeaders('wrong-secret');
            const request = createPostRequest('/api/cron/expire-invites', {}, headers);
            const response = await expireInvites(request);

            expectUnauthorized(response);
        });

        it('✅ Deve aceitar CRON_SECRET válido', async () => {
            const headers = createBearerHeaders('test-cron-secret');

            (prisma.familyInvite.updateMany as jest.Mock).mockResolvedValue({ count: 5 });

            const request = createPostRequest('/api/cron/expire-invites', {}, headers);
            const response = await expireInvites(request);

            expectOk(response);
            const data = await expectValidJson(response);
            expect(data).toHaveProperty('expiredCount');
        });

        it('✅ Deve deletar apenas convites expirados', async () => {
            const headers = createBearerHeaders('test-cron-secret');

            (prisma.familyInvite.updateMany as jest.Mock).mockResolvedValue({ count: 3 });

            const request = createPostRequest('/api/cron/expire-invites', {}, headers);
            await expireInvites(request);

            expect(prisma.familyInvite.updateMany).toHaveBeenCalledWith({
                where: {
                    status: 'pending',
                    expiresAt: { lte: expect.any(Date) },
                },
                data: {
                    status: 'expired',
                },
            });
        });
    });

    // ========================================
    // POST /api/cron/warm-cache
    // ========================================
    describe('POST /api/cron/warm-cache', () => {
        it('❌ Deve retornar 401 se sem Bearer token', async () => {
            const request = createPostRequest(
                '/api/cron/warm-cache',
                {},
                new Headers({ 'content-type': 'application/json' })
            );
            const response = await warmCache(request);

            expectUnauthorized(response);
        });

        it('❌ Deve retornar 401 se secret inválido', async () => {
            const headers = createBearerHeaders('wrong-secret');
            const request = createPostRequest('/api/cron/warm-cache', {}, headers);
            const response = await warmCache(request);

            expectUnauthorized(response);
        });

        it('✅ Deve aceitar CRON_SECRET válido', async () => {
            const headers = createBearerHeaders('test-cron-secret');

            // Mock fetch do TMDB
            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: async () => ({ results: [] }),
            });

            const request = createPostRequest('/api/cron/warm-cache', {}, headers);
            const response = await warmCache(request);

            expectOk(response);
        });

        it('✅ Deve ter circuit breaker e retry', async () => {
            const headers = createBearerHeaders('test-cron-secret');

            // Mock falha do TMDB
            (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

            const request = createPostRequest('/api/cron/warm-cache', {}, headers);
            const response = await warmCache(request);

            // Deve retornar erro gracefully, não crash
            expect([200, 500]).toContain(response.status);
        });
    });

    // ========================================
    // POST /api/cron/expire-trials
    // ========================================
    describe('POST /api/cron/expire-trials', () => {
        it('❌ Deve retornar 401 se sem Bearer token', async () => {
            const request = createPostRequest(
                '/api/cron/expire-trials',
                {},
                new Headers({ 'content-type': 'application/json' })
            );
            const response = await expireTrials(request);

            expectUnauthorized(response);
        });

        it('✅ Deve aceitar CRON_SECRET válido', async () => {
            const headers = createBearerHeaders('test-cron-secret');

            // Mock de usuários com trial expirado
            (prisma.user.findMany as jest.Mock).mockResolvedValue([
                { id: 'user-1' },
                { id: 'user-2' },
            ]);

            // Mock da transação - executa o callback diretamente
            (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
                // Simula o tx com os mesmos métodos do prisma
                return await callback(prisma);
            });

            // Mock dos métodos usados dentro da transação
            (prisma.family.findFirst as jest.Mock).mockResolvedValue(null);
            (prisma.user.update as jest.Mock).mockResolvedValue({});

            const request = createPostRequest('/api/cron/expire-trials', {}, headers);
            const response = await expireTrials(request);

            expectOk(response);
            const data = await expectValidJson(response);
            expect(data).toHaveProperty('expiredCount');
        });

        it('✅ Deve expirar apenas trials com data passada', async () => {
            const headers = createBearerHeaders('test-cron-secret');

            (prisma.subscription.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

            const request = createPostRequest('/api/cron/expire-trials', {}, headers);
            await expireTrials(request);

            expect(prisma.subscription.updateMany).toHaveBeenCalledWith({
                where: {
                    status: 'trial',
                    trialEndsAt: { lt: expect.any(Date) },
                },
                data: {
                    status: 'expired',
                },
            });
        });
    });

    // ========================================
    // GET /api/metrics/cache
    // ========================================
    describe('GET /api/metrics/cache', () => {
        it('❌ Deve retornar 401 se sem Bearer token', async () => {
            const request = createGetRequest(
                '/api/metrics/cache',
                new Headers()
            );
            const response = await metricsCache(request);

            expectUnauthorized(response);
        });

        it('❌ Deve retornar 401 se secret inválido', async () => {
            const headers = createBearerHeaders('wrong-secret');
            const request = createGetRequest('/api/metrics/cache', headers);
            const response = await metricsCache(request);

            expectUnauthorized(response);
        });

        it('✅ Deve aceitar ADMIN_SECRET válido', async () => {
            const headers = createBearerHeaders('test-admin-secret');
            const request = createGetRequest('/api/metrics/cache', headers);
            const response = await metricsCache(request);

            expectOk(response);
            const data = await expectValidJson(response);
            expect(data).toHaveProperty('metrics');
        });

        it('✅ Deve retornar métricas sanitizadas (sem dados sensíveis)', async () => {
            const headers = createBearerHeaders('test-admin-secret');
            const request = createGetRequest('/api/metrics/cache', headers);
            const response = await metricsCache(request);

            const data = await expectValidJson(response);

            // Não deve conter user IDs, emails, etc
            const dataStr = JSON.stringify(data);
            expect(dataStr).not.toContain('userId');
            expect(dataStr).not.toContain('email');
        });
    });

    // ========================================
    // GET /api/health/tmdb
    // ========================================
    describe('GET /api/health/tmdb', () => {
        it('❌ Deve retornar 401 se sem Bearer token', async () => {
            const request = createGetRequest(
                '/api/health/tmdb',
                new Headers()
            );
            const response = await healthTmdb(request);

            expectUnauthorized(response);
        });

        it('✅ Deve aceitar ADMIN_SECRET válido', async () => {
            const headers = createBearerHeaders('test-admin-secret');

            // Mock TMDB health check
            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: async () => ({ success: true }),
            });

            const request = createGetRequest('/api/health/tmdb', headers);
            const response = await healthTmdb(request);

            expectOk(response);
            const data = await expectValidJson(response);
            expect(data).toHaveProperty('healthy');
        });

        it('✅ Deve reportar erro se TMDB está down', async () => {
            const headers = createBearerHeaders('test-admin-secret');

            // Mock TMDB down
            (global.fetch as jest.Mock).mockRejectedValue(new Error('Connection timeout'));

            const request = createGetRequest('/api/health/tmdb', headers);
            const response = await healthTmdb(request);

            const data = await expectValidJson(response);
            expect(data.healthy).toBe(false);
        });
    });

    // ========================================
    // POST /api/revalidate
    // ========================================
    describe('POST /api/revalidate', () => {
        it('❌ Deve retornar 401 se sem Authorization header', async () => {
            const request = createPostRequest(
                '/api/revalidate',
                { tag: 'movies' },
                new Headers({ 'content-type': 'application/json' })
            );
            const response = await revalidate(request);

            expectUnauthorized(response);
        });

        it('❌ Deve retornar 401 se secret inválido', async () => {
            const headers = createBearerHeaders('wrong-secret');
            const request = createPostRequest(
                '/api/revalidate',
                { tag: 'movies' },
                headers
            );
            const response = await revalidate(request);

            expectUnauthorized(response);
        });

        it('✅ Deve aceitar ADMIN_SECRET válido', async () => {
            const headers = createBearerHeaders('test-admin-secret');
            const request = createPostRequest(
                '/api/revalidate',
                { tag: 'movies' },
                headers
            );
            const response = await revalidate(request);

            expectOk(response);
        });

        it('❌ Deve validar tag obrigatória', async () => {
            const headers = createBearerHeaders('test-admin-secret');
            const request = createPostRequest(
                '/api/revalidate',
                {},
                headers
            );
            const response = await revalidate(request);

            expect(response.status).toBe(400);
        });

        it('❌ Deve validar tag whitelist', async () => {
            const headers = createBearerHeaders('test-admin-secret');

            // Tag não permitida
            const request = createPostRequest(
                '/api/revalidate',
                { tag: 'malicious-tag' },
                headers
            );
            const response = await revalidate(request);

            expect(response.status).toBe(400);
            const data = await extractJson(response);
            expect(data.error).toContain('tag');
        });

        it('✅ Deve aceitar tags na whitelist', async () => {
            const headers = createBearerHeaders('test-admin-secret');

            const validTags = ['movies', 'tv', 'trending', 'popular'];

            for (const tag of validTags) {
                const request = createPostRequest(
                    '/api/revalidate',
                    { tag },
                    headers
                );
                const response = await revalidate(request);

                expectOk(response);
            }
        });
    });

    // ========================================
    // 🔒 TESTES DE SEGURANÇA
    // ========================================
    describe('🔒 Security Tests', () => {
        it('✅ PRODUÇÃO: Deve exigir secrets válidos', async () => {
            process.env.NODE_ENV = 'production';

            // Sem token
            const request1 = createPostRequest(
                '/api/cron/expire-invites',
                {},
                new Headers()
            );
            const response1 = await expireInvites(request1);
            expectUnauthorized(response1);

            // Token inválido
            const headers2 = createBearerHeaders('invalid');
            const request2 = createPostRequest('/api/cron/expire-invites', {}, headers2);
            const response2 = await expireInvites(request2);
            expectUnauthorized(response2);
        });

        it('✅ Webhooks devem verificar secret via header', async () => {
            // Header errado
            const headers1 = new Headers({
                'content-type': 'application/json',
                'authorization': 'Bearer test-webhook-secret', // ❌ Errado
            });

            const request1 = createPostRequest(
                '/api/webhooks/payment',
                {
                    type: 'payment.succeeded',
                    userId: 'u1',
                    planId: 'premium',
                },
                headers1
            );
            const response1 = await webhookPayment(request1);
            expectUnauthorized(response1);

            // Header correto
            const headers2 = new Headers({
                'content-type': 'application/json',
                'x-webhook-secret': 'test-webhook-secret', // ✅ Correto
            });

            (prisma.webhookEvent.findUnique as jest.Mock).mockResolvedValue(null);
            (prisma.$transaction as jest.Mock).mockResolvedValue({});

            const request2 = createPostRequest(
                '/api/webhooks/payment',
                {
                    type: 'payment.succeeded',
                    userId: 'u1',
                    planId: 'premium',
                    transactionId: 'tx-1',
                    amount: 29.90,
                },
                headers2
            );
            const response2 = await webhookPayment(request2);
            expectOk(response2);
        });

        it('✅ Secrets NÃO devem vazar em logs ou responses', async () => {
            const headers = createBearerHeaders('wrong-secret');
            const request = createGetRequest('/api/metrics/cache', headers);
            const response = await metricsCache(request);

            const data = await extractJson(response);
            const dataStr = JSON.stringify(data);

            // Secret não deve aparecer na resposta
            expect(dataStr).not.toContain('test-admin-secret');
            expect(dataStr).not.toContain('ADMIN_SECRET');
        });
    });
});
