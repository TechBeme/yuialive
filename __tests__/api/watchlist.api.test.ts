/**
 * 🧪 WATCHLIST API TESTS
 * Testes completos para /api/watchlist/*
 * 
 * Valida:
 * - ✅ Autenticação obrigatória (Better Auth)
 * - ✅ Payloads mínimos (204 No Content para mutations)
 * - ✅ Formato correto de resposta
 * - ✅ Validação de inputs
 * - ✅ Segurança (userId da sessão, não do body)
 * - ✅ Rate limiting
 */

import { GET as watchlistGet } from '@/app/api/watchlist/route';
import { POST as watchlistAdd } from '@/app/api/watchlist/add/route';
import { POST as watchlistRemove } from '@/app/api/watchlist/remove/route';

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
    expectValidJson,
    expectEmptyBody,
    expectErrorStructure,
} from '../helpers/payload.helper';

import {
    createGetRequest,
    createPostRequest,
    addQueryParams,
    extractJson,
} from '../helpers/request.helper';

// Mock dos módulos necessários
jest.mock('@/lib/watchlist-server');
jest.mock('@/lib/api/validation');
jest.mock('@/lib/security/rate-limit');
jest.mock('@/lib/prisma', () => ({
    prisma: {
        watchlist: {
            findMany: jest.fn(),
            count: jest.fn(),
            upsert: jest.fn(),
            deleteMany: jest.fn(),
        },
        userPreferences: {
            findUnique: jest.fn(),
        },
    },
}));

import { getWatchlist } from '@/lib/watchlist-server';
import { requireAuth, validateBody } from '@/lib/api/validation';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { prisma } from '@/lib/prisma';

describe('🎬 Watchlist API Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();

        // Mock padrão de rate limit (permitido)
        (checkRateLimit as jest.Mock).mockReturnValue({
            allowed: true,
            remaining: 29,
            resetTime: Date.now() + 60000,
        });

        // Mock padrão de user preferences (sem preferências específicas)
        (prisma.userPreferences.findUnique as jest.Mock).mockResolvedValue(null);

        // Mock padrão de watchlist (vazio)
        (prisma.watchlist.findMany as jest.Mock).mockResolvedValue([]);
        (prisma.watchlist.count as jest.Mock).mockResolvedValue(0);
    });

    afterEach(() => {
        clearAuthMocks();
    });

    // ========================================
    // GET /api/watchlist
    // ========================================
    describe('GET /api/watchlist', () => {
        it('❌ Deve retornar 401 se não autenticado', async () => {
            mockAuthUnauthenticated();

            const request = createGetRequest('/api/watchlist', createUnauthHeaders());
            const response = await watchlistGet(request);

            expectUnauthorized(response);
            const data = await extractJson(response);
            expectErrorStructure(data);
        });

        it('✅ Deve retornar lista vazia se usuário não tem favoritos', async () => {
            mockAuthAuthenticated();
            (getWatchlist as jest.Mock).mockResolvedValue({
                items: [],
                total: 0,
                movieCount: 0,
                tvCount: 0,
            });

            const request = createGetRequest('/api/watchlist', createAuthHeaders());
            const response = await watchlistGet(request);

            expectOk(response);
            const data = await expectValidJson(response);

            expect(data).toHaveProperty('items');
            expect(data).toHaveProperty('total');
            expect(data).toHaveProperty('hasMore');
            expect(data.items).toEqual([]);
            expect(data.total).toBe(0);
        });

        it('✅ Deve retornar watchlist com formato correto', async () => {
            mockAuthAuthenticated();

            const mockWatchlist = {
                items: [
                    {
                        id: 'item-1',
                        mediaId: 123,
                        mediaType: 'movie',
                        title: 'Test Movie',
                        overview: 'Test overview',
                        posterPath: '/test.jpg',
                        backdropPath: '/backdrop.jpg',
                        voteAverage: 8.5,
                        releaseDate: '2024-01-01',
                        addedAt: '2024-02-01T00:00:00Z',
                    },
                ],
                total: 1,
                movieCount: 1,
                tvCount: 0,
            };

            (getWatchlist as jest.Mock).mockResolvedValue(mockWatchlist);

            const request = createGetRequest('/api/watchlist', createAuthHeaders());
            const response = await watchlistGet(request);

            expectOk(response);
            const data = await expectValidJson(response);

            expect(data).toHaveProperty('items');
            expect(data).toHaveProperty('total');
            expect(data).toHaveProperty('movieCount');
            expect(data).toHaveProperty('tvCount');
            expect(data).toHaveProperty('offset');
            expect(data).toHaveProperty('limit');
            expect(data).toHaveProperty('hasMore');

            expect(data.items).toHaveLength(1);
            expect(data.items[0]).toHaveProperty('id');
            expect(data.items[0]).toHaveProperty('mediaId');
            expect(data.items[0]).toHaveProperty('title');
        });

        it('✅ Deve respeitar paginação (offset)', async () => {
            mockAuthAuthenticated();

            const mockWatchlist = {
                items: [],
                total: 50,
                movieCount: 30,
                tvCount: 20,
            };

            (getWatchlist as jest.Mock).mockResolvedValue(mockWatchlist);

            const url = addQueryParams('/api/watchlist', { offset: '18' });
            const request = createGetRequest(url, createAuthHeaders());
            const response = await watchlistGet(request);

            expectOk(response);
            const data = await expectValidJson(response);

            expect(data.offset).toBe(18);
            expect(data.limit).toBe(18);

            // Verificar que getWatchlist foi chamado com offset correto
            expect(getWatchlist).toHaveBeenCalledWith(
                'test-user-id-123',
                expect.objectContaining({
                    offset: 18,
                    limit: 18,
                })
            );
        });

        it('❌ Deve validar offset >= 0', async () => {
            mockAuthAuthenticated();

            const url = addQueryParams('/api/watchlist', { offset: '-1' });
            const request = createGetRequest(url, createAuthHeaders());
            const response = await watchlistGet(request);

            expect(response.status).toBe(400);
            const data = await extractJson(response);
            expect(data).toHaveProperty('error');
            expect(data.message).toContain('offset');
        });

        it('❌ Deve validar mediaType (movie ou tv)', async () => {
            mockAuthAuthenticated();

            const url = addQueryParams('/api/watchlist', { mediaType: 'invalid' });
            const request = createGetRequest(url, createAuthHeaders());
            const response = await watchlistGet(request);

            expect(response.status).toBe(400);
            const data = await extractJson(response);
            expect(data).toHaveProperty('error');
            expect(data.message).toContain('mediaType');
        });

        it('✅ Deve filtrar por mediaType quando fornecido', async () => {
            mockAuthAuthenticated();

            (getWatchlist as jest.Mock).mockResolvedValue({
                items: [],
                total: 0,
                movieCount: 0,
                tvCount: 0,
            });

            const url = addQueryParams('/api/watchlist', { mediaType: 'movie' });
            const request = createGetRequest(url, createAuthHeaders());
            await watchlistGet(request);

            // Verificar que getWatchlist foi chamado com mediaType
            expect(getWatchlist).toHaveBeenCalledWith(
                'test-user-id-123',
                expect.objectContaining({
                    mediaType: 'movie',
                })
            );
        });
    });

    // ========================================
    // POST /api/watchlist/add
    // ========================================
    describe('POST /api/watchlist/add', () => {
        it('❌ Deve retornar 401 se não autenticado', async () => {
            (requireAuth as jest.Mock).mockResolvedValue({
                error: { status: 401 },
            });

            const request = createPostRequest(
                '/api/watchlist/add',
                { tmdbId: 123, mediaType: 'movie' },
                createUnauthHeaders()
            );
            const response = await watchlistAdd(request);

            expect(response.status).toBe(401);
        });

        it('✅ Deve retornar 204 No Content ao adicionar (payload mínimo)', async () => {
            (requireAuth as jest.Mock).mockResolvedValue({
                userId: 'test-user-id-123',
            });

            (validateBody as jest.Mock).mockResolvedValue({
                data: { tmdbId: 123, mediaType: 'movie' },
            });

            (prisma.watchlist.upsert as jest.Mock).mockResolvedValue({});

            const request = createPostRequest(
                '/api/watchlist/add',
                { tmdbId: 123, mediaType: 'movie' },
                createAuthHeaders()
            );
            const response = await watchlistAdd(request);

            await expectEmptyBody(response);
        });

        it('✅ Deve ser idempotente (retorna 204 mesmo se já existe)', async () => {
            (requireAuth as jest.Mock).mockResolvedValue({
                userId: 'test-user-id-123',
            });

            (validateBody as jest.Mock).mockResolvedValue({
                data: { tmdbId: 123, mediaType: 'movie' },
            });

            (prisma.watchlist.upsert as jest.Mock).mockResolvedValue({});

            const request = createPostRequest(
                '/api/watchlist/add',
                { tmdbId: 123, mediaType: 'movie' },
                createAuthHeaders()
            );
            const response = await watchlistAdd(request);

            await expectEmptyBody(response);

            // Verificar que upsert foi usado (cria ou atualiza)
            expect(prisma.watchlist.upsert).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        userId_tmdbId_mediaType: expect.objectContaining({
                            userId: 'test-user-id-123',
                            tmdbId: 123,
                            mediaType: 'movie',
                        }),
                    }),
                })
            );
        });

        it('❌ Deve validar tmdbId obrigatório', async () => {
            (requireAuth as jest.Mock).mockResolvedValue({
                userId: 'test-user-id-123',
            });

            (validateBody as jest.Mock).mockResolvedValue({
                error: { status: 400 },
            });

            const request = createPostRequest(
                '/api/watchlist/add',
                { mediaType: 'movie' }, // sem tmdbId
                createAuthHeaders()
            );
            const response = await watchlistAdd(request);

            expect(response.status).toBe(400);
        });

        it('❌ Deve validar mediaType enum', async () => {
            (requireAuth as jest.Mock).mockResolvedValue({
                userId: 'test-user-id-123',
            });

            (validateBody as jest.Mock).mockResolvedValue({
                error: { status: 400 },
            });

            const request = createPostRequest(
                '/api/watchlist/add',
                { tmdbId: 123, mediaType: 'invalid' },
                createAuthHeaders()
            );
            const response = await watchlistAdd(request);

            expect(response.status).toBe(400);
        });

        it('❌ Deve respeitar rate limit', async () => {
            (checkRateLimit as jest.Mock).mockReturnValue({
                allowed: false,
                remaining: 0,
                resetTime: Date.now() + 30000,
            });

            const request = createPostRequest(
                '/api/watchlist/add',
                { tmdbId: 123, mediaType: 'movie' },
                createAuthHeaders()
            );
            const response = await watchlistAdd(request);

            expect(response.status).toBe(429);
        });

        it('🔒 Deve usar SEMPRE userId da sessão (não do body)', async () => {
            (requireAuth as jest.Mock).mockResolvedValue({
                userId: 'test-user-id-123',
            });

            (validateBody as jest.Mock).mockResolvedValue({
                data: {
                    tmdbId: 123,
                    mediaType: 'movie',
                    // Cliente tenta injetar userId diferente (ataque)
                    userId: 'malicious-user-id',
                },
            });

            (prisma.watchlist.upsert as jest.Mock).mockResolvedValue({});

            const request = createPostRequest(
                '/api/watchlist/add',
                { tmdbId: 123, mediaType: 'movie', userId: 'malicious-user-id' },
                createAuthHeaders()
            );
            await watchlistAdd(request);

            // Validar que Prisma foi chamado com userId da sessão, NÃO do body
            expect(prisma.watchlist.upsert).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        userId_tmdbId_mediaType: expect.objectContaining({
                            userId: 'test-user-id-123', // ✅ Da sessão
                        }),
                    }),
                    create: expect.objectContaining({
                        userId: 'test-user-id-123', // ✅ Da sessão
                    }),
                })
            );
        });
    });

    // ========================================
    // POST /api/watchlist/remove
    // ========================================
    describe('POST /api/watchlist/remove', () => {
        it('❌ Deve retornar 401 se não autenticado', async () => {
            (requireAuth as jest.Mock).mockResolvedValue({
                error: { status: 401 },
            });

            const request = createPostRequest(
                '/api/watchlist/remove',
                { tmdbId: 123, mediaType: 'movie' },
                createUnauthHeaders()
            );
            const response = await watchlistRemove(request);

            expect(response.status).toBe(401);
        });

        it('✅ Deve retornar 204 No Content ao remover', async () => {
            (requireAuth as jest.Mock).mockResolvedValue({
                userId: 'test-user-id-123',
            });

            (validateBody as jest.Mock).mockResolvedValue({
                data: { tmdbId: 123, mediaType: 'movie' },
            });

            (prisma.watchlist.deleteMany as jest.Mock).mockResolvedValue({
                count: 1,
            });

            const request = createPostRequest(
                '/api/watchlist/remove',
                { tmdbId: 123, mediaType: 'movie' },
                createAuthHeaders()
            );
            const response = await watchlistRemove(request);

            await expectEmptyBody(response);
        });

        it('❌ Deve retornar 404 se item não existe', async () => {
            (requireAuth as jest.Mock).mockResolvedValue({
                userId: 'test-user-id-123',
            });

            (validateBody as jest.Mock).mockResolvedValue({
                data: { tmdbId: 123, mediaType: 'movie' },
            });

            (prisma.watchlist.deleteMany as jest.Mock).mockResolvedValue({
                count: 0, // Não encontrou nada para deletar
            });

            const request = createPostRequest(
                '/api/watchlist/remove',
                { tmdbId: 123, mediaType: 'movie' },
                createAuthHeaders()
            );
            const response = await watchlistRemove(request);

            expect(response.status).toBe(404);
            const data = await extractJson(response);
            expect(data).toHaveProperty('error');
        });

        it('❌ Deve validar inputs obrigatórios', async () => {
            (requireAuth as jest.Mock).mockResolvedValue({
                userId: 'test-user-id-123',
            });

            (validateBody as jest.Mock).mockResolvedValue({
                error: { status: 400 },
            });

            const request = createPostRequest(
                '/api/watchlist/remove',
                {}, // sem tmdbId nem mediaType
                createAuthHeaders()
            );
            const response = await watchlistRemove(request);

            expect(response.status).toBe(400);
        });

        it('🔒 Deve deletar APENAS itens do usuário autenticado', async () => {
            (requireAuth as jest.Mock).mockResolvedValue({
                userId: 'test-user-id-123',
            });

            (validateBody as jest.Mock).mockResolvedValue({
                data: { tmdbId: 123, mediaType: 'movie' },
            });

            (prisma.watchlist.deleteMany as jest.Mock).mockResolvedValue({
                count: 1,
            });

            const request = createPostRequest(
                '/api/watchlist/remove',
                { tmdbId: 123, mediaType: 'movie' },
                createAuthHeaders()
            );
            await watchlistRemove(request);

            // Validar que deleteMany foi chamado com userId da sessão
            expect(prisma.watchlist.deleteMany).toHaveBeenCalledWith({
                where: {
                    userId: 'test-user-id-123',
                    tmdbId: 123,
                    mediaType: 'movie',
                },
            });
        });
    });

    // ========================================
    // 🔒 Security Tests
    // ========================================
    describe('🔒 Security Tests', () => {
        it('✅ Deve usar SEMPRE auth.api.getSession() para userId', async () => {
            mockAuthAuthenticated();

            (getWatchlist as jest.Mock).mockResolvedValue({
                items: [],
                total: 0,
                movieCount: 0,
                tvCount: 0,
            });

            const request = createGetRequest('/api/watchlist', createAuthHeaders());
            await watchlistGet(request);

            // Validar que getWatchlist foi chamado com userId da sessão
            expect(getWatchlist).toHaveBeenCalledWith(
                'test-user-id-123', // ✅ userId da sessão mockada
                expect.any(Object)
            );
        });

        it('❌ NUNCA deve aceitar userId do body/query em mutations', async () => {
            (requireAuth as jest.Mock).mockResolvedValue({
                userId: 'test-user-id-123',
            });

            (validateBody as jest.Mock).mockResolvedValue({
                data: {
                    tmdbId: 123,
                    mediaType: 'movie',
                    userId: 'hacker-user-id', // Tentativa de ataque
                },
            });

            (prisma.watchlist.upsert as jest.Mock).mockResolvedValue({});

            const request = createPostRequest(
                '/api/watchlist/add',
                { tmdbId: 123, mediaType: 'movie', userId: 'hacker-user-id' },
                createAuthHeaders()
            );
            await watchlistAdd(request);

            // Validar que usou userId da sessão, ignorou o do body
            const callArgs = (prisma.watchlist.upsert as jest.Mock).mock.calls[0][0];
            expect(callArgs.where.userId_tmdbId_mediaType.userId).toBe('test-user-id-123');
            expect(callArgs.create.userId).toBe('test-user-id-123');
        });
    });
});
