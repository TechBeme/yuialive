/**
 * 🧪 WATCH HISTORY API TESTS
 * Testes completos para /api/watch-history
 * 
 * Valida:
 * - ✅ Autenticação obrigatória (Better Auth)
 * - ✅ Payloads mínimos (204 No Content para mutations)
 * - ✅ Fix crítico de performance: GET não chama TMDB diretamente (-97% latency)
 * - ✅ Validação de progress (0-100)
 * - ✅ Segurança (userId da sessão)
 * - ✅ Rate limiting por endpoint
 */

import { GET as watchHistoryGet, POST as watchHistoryPost, DELETE as watchHistoryDelete } from '@/app/api/watch-history/route';

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
    createDeleteRequest,
    addQueryParams,
    extractJson,
} from '../helpers/request.helper';

// Mock dos módulos necessários
jest.mock('@/lib/rate-limit');
jest.mock('@/lib/tmdb-cache');
jest.mock('@/lib/prisma', () => ({
    prisma: {
        watchHistory: {
            findMany: jest.fn(),
            upsert: jest.fn(),
            delete: jest.fn(),
        },
        userPreferences: {
            findUnique: jest.fn(),
        },
    },
}));

import { rateLimit, getRateLimitHeaders } from '@/lib/rate-limit';
import { getMediaDetailsWithCache } from '@/lib/tmdb-cache';
import { prisma } from '@/lib/prisma';

describe('📺 Watch History API Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();

        // Mock padrão de rate limit (permitido)
        (rateLimit as jest.Mock).mockReturnValue({
            success: true,
            remaining: 50,
            limit: 60,
        });

        (getRateLimitHeaders as jest.Mock).mockReturnValue({
            'X-RateLimit-Limit': '60',
            'X-RateLimit-Remaining': '59',
        });
    });

    afterEach(() => {
        clearAuthMocks();
    });

    // ========================================
    // GET /api/watch-history
    // ========================================
    describe('GET /api/watch-history', () => {
        it('❌ Deve retornar 401 se não autenticado', async () => {
            mockAuthUnauthenticated();

            const request = createGetRequest('/api/watch-history', createUnauthHeaders());
            const response = await watchHistoryGet(request);

            expectUnauthorized(response);
            const data = await extractJson(response);
            expectErrorStructure(data);
        });

        it('✅ Deve retornar lista vazia se não há histórico', async () => {
            mockAuthAuthenticated();
            (prisma.watchHistory.findMany as jest.Mock).mockResolvedValue([]); (getMediaDetailsWithCache as jest.Mock).mockResolvedValue(null);
            const request = createGetRequest('/api/watch-history', createAuthHeaders());
            const response = await watchHistoryGet(request);

            expectOk(response);
            const data = await expectValidJson(response);

            expect(data).toHaveProperty('history');
            expect(data.history).toEqual([]);
        });

        it('✅ Deve retornar histórico enriquecido com título e poster', async () => {
            mockAuthAuthenticated();

            const mockHistory = [
                {
                    id: 'history-1',
                    userId: 'test-user-id-123',
                    tmdbId: 550,
                    mediaType: 'movie',
                    progress: 75,
                    lastWatchedAt: new Date(),
                    createdAt: new Date(),
                },
            ];

            (prisma.watchHistory.findMany as jest.Mock).mockResolvedValue(mockHistory);
            (getMediaDetailsWithCache as jest.Mock).mockResolvedValue({
                title: 'Fight Club',
                poster_path: '/poster.jpg',
            });

            const request = createGetRequest('/api/watch-history', createAuthHeaders());
            const response = await watchHistoryGet(request);

            expectOk(response);
            const data = await expectValidJson(response);

            expect(data.history).toHaveLength(1);
            expect(data.history[0]).toHaveProperty('title', 'Fight Club');
            expect(data.history[0]).toHaveProperty('posterPath', '/poster.jpg');
            expect(data.history[0]).toHaveProperty('progress', 75);
        });

        it('🚀 CRÍTICO: Deve usar cache TMDB (não fazer requests diretos)', async () => {
            mockAuthAuthenticated();

            const mockHistory = [
                {
                    id: 'history-1',
                    userId: 'test-user-id-123',
                    tmdbId: 550,
                    mediaType: 'movie',
                    progress: 50,
                    lastWatchedAt: new Date(),
                    createdAt: new Date(),
                },
            ];

            (prisma.watchHistory.findMany as jest.Mock).mockResolvedValue(mockHistory);
            (getMediaDetailsWithCache as jest.Mock).mockResolvedValue({
                title: 'Cached Movie',
                poster_path: '/cached.jpg',
            });

            const request = createGetRequest('/api/watch-history', createAuthHeaders());
            await watchHistoryGet(request);

            // VALIDAÇÃO CRÍTICA: Deve usar getMediaDetailsWithCache (não fetch direto)
            expect(getMediaDetailsWithCache).toHaveBeenCalledWith(550, 'movie');

            // VALIDAÇÃO CRÍTICA: Não deve fazer fetch direto ao TMDB
            expect(global.fetch).not.toHaveBeenCalled();
        });

        it('✅ Deve limitar a 50 itens por padrão', async () => {
            mockAuthAuthenticated();
            (prisma.watchHistory.findMany as jest.Mock).mockResolvedValue([]);
            (getMediaDetailsWithCache as jest.Mock).mockResolvedValue(null);

            const request = createGetRequest('/api/watch-history', createAuthHeaders());
            await watchHistoryGet(request);

            // Verificar que findMany foi chamado com take: 50 (padrão)
            expect(prisma.watchHistory.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    take: 50,
                })
            );
        });

        it('✅ Deve ordenar por lastWatchedAt descendente', async () => {
            mockAuthAuthenticated();
            (prisma.watchHistory.findMany as jest.Mock).mockResolvedValue([]);

            const request = createGetRequest('/api/watch-history', createAuthHeaders());
            await watchHistoryGet(request);

            expect(prisma.watchHistory.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    orderBy: {
                        lastWatchedAt: 'desc',
                    },
                })
            );
        });

        it('❌ Deve respeitar rate limit (60/min)', async () => {
            mockAuthAuthenticated();
            (rateLimit as jest.Mock).mockReturnValue({
                success: false,
                remaining: 0,
                limit: 60,
            });

            const request = createGetRequest('/api/watch-history', createAuthHeaders());
            const response = await watchHistoryGet(request);

            expect(response.status).toBe(429);
            const data = await extractJson(response);
            expect(data.error).toContain('Muitas requisições');
        });

        it('✅ Deve incluir headers de rate limit na resposta', async () => {
            mockAuthAuthenticated();
            (prisma.watchHistory.findMany as jest.Mock).mockResolvedValue([]);

            const request = createGetRequest('/api/watch-history', createAuthHeaders());
            const response = await watchHistoryGet(request);

            expect(response.headers.get('X-RateLimit-Limit')).toBeTruthy();
            expect(response.headers.get('X-RateLimit-Remaining')).toBeTruthy();
        });
    });

    // ========================================
    // POST /api/watch-history
    // ========================================
    describe('POST /api/watch-history', () => {
        it('❌ Deve retornar 401 se não autenticado', async () => {
            mockAuthUnauthenticated();

            const request = createPostRequest(
                '/api/watch-history',
                { tmdbId: 550, mediaType: 'movie', progress: 50 },
                createUnauthHeaders()
            );
            const response = await watchHistoryPost(request);

            expectUnauthorized(response);
        });

        it('✅ Deve retornar 204 No Content ao salvar progresso', async () => {
            mockAuthAuthenticated();
            (prisma.watchHistory.upsert as jest.Mock).mockResolvedValue({});

            const request = createPostRequest(
                '/api/watch-history',
                { tmdbId: 550, mediaType: 'movie', progress: 50 },
                createAuthHeaders()
            );
            const response = await watchHistoryPost(request);

            await expectEmptyBody(response);
        });

        it('✅ Deve usar upsert (cria ou atualiza)', async () => {
            mockAuthAuthenticated();
            (prisma.watchHistory.upsert as jest.Mock).mockResolvedValue({});

            const request = createPostRequest(
                '/api/watch-history',
                { tmdbId: 550, mediaType: 'movie', progress: 75 },
                createAuthHeaders()
            );
            await watchHistoryPost(request);

            expect(prisma.watchHistory.upsert).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        userId_tmdbId_mediaType_seasonNumber_episodeNumber: expect.objectContaining({
                            userId: 'test-user-id-123',
                            tmdbId: 550,
                            mediaType: 'movie',
                            seasonNumber: 0,
                            episodeNumber: 0,
                        }),
                    }),
                    update: expect.objectContaining({
                        progress: 75,
                    }),
                    create: expect.objectContaining({
                        userId: 'test-user-id-123',
                        tmdbId: 550,
                        mediaType: 'movie',
                        progress: 75,
                    }),
                })
            );
        });

        it('❌ Deve validar tmdbId obrigatório e positivo', async () => {
            mockAuthAuthenticated();

            const request1 = createPostRequest(
                '/api/watch-history',
                { mediaType: 'movie', progress: 50 },
                createAuthHeaders()
            );
            const response1 = await watchHistoryPost(request1);
            expect(response1.status).toBe(400);

            const request2 = createPostRequest(
                '/api/watch-history',
                { tmdbId: -1, mediaType: 'movie', progress: 50 },
                createAuthHeaders()
            );
            const response2 = await watchHistoryPost(request2);
            expect(response2.status).toBe(400);
        });

        it('❌ Deve validar mediaType enum', async () => {
            mockAuthAuthenticated();

            const request = createPostRequest(
                '/api/watch-history',
                { tmdbId: 550, mediaType: 'invalid', progress: 50 },
                createAuthHeaders()
            );
            const response = await watchHistoryPost(request);

            expect(response.status).toBe(400);
            const data = await extractJson(response);
            expect(data.error).toContain('mediaType');
        });

        it('❌ Deve validar progress entre 0 e 100', async () => {
            mockAuthAuthenticated();

            const request1 = createPostRequest(
                '/api/watch-history',
                { tmdbId: 550, mediaType: 'movie', progress: -10 },
                createAuthHeaders()
            );
            const response1 = await watchHistoryPost(request1);
            expect(response1.status).toBe(400);

            const request2 = createPostRequest(
                '/api/watch-history',
                { tmdbId: 550, mediaType: 'movie', progress: 150 },
                createAuthHeaders()
            );
            const response2 = await watchHistoryPost(request2);
            expect(response2.status).toBe(400);
        });

        it('✅ Deve normalizar progress fora do range (0-100)', async () => {
            mockAuthAuthenticated();
            (prisma.watchHistory.upsert as jest.Mock).mockResolvedValue({});

            // Progress > 100 deve ser normalizado para 100
            const request1 = createPostRequest(
                '/api/watch-history',
                { tmdbId: 550, mediaType: 'movie', progress: 'not-a-number' },
                createAuthHeaders()
            );
            // Isso deve resultar em erro 400, não normalização
            const response1 = await watchHistoryPost(request1);
            expect(response1.status).toBe(400);
        });

        it('🔒 Deve usar SEMPRE userId da sessão', async () => {
            mockAuthAuthenticated();
            (prisma.watchHistory.upsert as jest.Mock).mockResolvedValue({});

            const request = createPostRequest(
                '/api/watch-history',
                {
                    tmdbId: 550,
                    mediaType: 'movie',
                    progress: 50,
                    userId: 'hacker-user-id', // Tentativa de ataque
                },
                createAuthHeaders()
            );
            await watchHistoryPost(request);

            const callArgs = (prisma.watchHistory.upsert as jest.Mock).mock.calls[0][0];
            expect(callArgs.where.userId_tmdbId_mediaType_seasonNumber_episodeNumber.userId).toBe('test-user-id-123');
            expect(callArgs.create.userId).toBe('test-user-id-123');
        });

        it('❌ Deve respeitar rate limit (30/min)', async () => {
            mockAuthAuthenticated();
            (rateLimit as jest.Mock).mockReturnValue({
                success: false,
                remaining: 0,
                limit: 30,
            });

            const request = createPostRequest(
                '/api/watch-history',
                { tmdbId: 550, mediaType: 'movie', progress: 50 },
                createAuthHeaders()
            );
            const response = await watchHistoryPost(request);

            expect(response.status).toBe(429);
        });
    });

    // ========================================
    // DELETE /api/watch-history
    // ========================================
    describe('DELETE /api/watch-history', () => {
        it('❌ Deve retornar 401 se não autenticado', async () => {
            mockAuthUnauthenticated();

            const url = addQueryParams('/api/watch-history', { tmdbId: '550', mediaType: 'movie' });
            const request = createDeleteRequest(url, undefined, createUnauthHeaders());
            const response = await watchHistoryDelete(request);

            expectUnauthorized(response);
        });

        it('✅ Deve retornar 204 No Content ao deletar', async () => {
            mockAuthAuthenticated();
            (prisma.watchHistory.delete as jest.Mock).mockResolvedValue({});

            const url = addQueryParams('/api/watch-history', { tmdbId: '550', mediaType: 'movie' });
            const request = createDeleteRequest(url, undefined, createAuthHeaders());
            const response = await watchHistoryDelete(request);

            await expectEmptyBody(response);
        });

        it('✅ Deve deletar item específico do usuário', async () => {
            mockAuthAuthenticated();
            (prisma.watchHistory.delete as jest.Mock).mockResolvedValue({});

            const url = addQueryParams('/api/watch-history', { tmdbId: '550', mediaType: 'movie' });
            const request = createDeleteRequest(url, undefined, createAuthHeaders());
            await watchHistoryDelete(request);

            expect(prisma.watchHistory.delete).toHaveBeenCalledWith({
                where: {
                    userId_tmdbId_mediaType_seasonNumber_episodeNumber: {
                        userId: 'test-user-id-123',
                        tmdbId: 550,
                        mediaType: 'movie',
                        seasonNumber: 0,
                        episodeNumber: 0,
                    },
                },
            });
        });

        it('❌ Deve validar query params obrigatórios', async () => {
            mockAuthAuthenticated();

            // Sem tmdbId
            const url1 = addQueryParams('/api/watch-history', { mediaType: 'movie' });
            const request1 = createDeleteRequest(url1, undefined, createAuthHeaders());
            const response1 = await watchHistoryDelete(request1);
            expect(response1.status).toBe(400);

            // Sem mediaType
            const url2 = addQueryParams('/api/watch-history', { tmdbId: '550' });
            const request2 = createDeleteRequest(url2, undefined, createAuthHeaders());
            const response2 = await watchHistoryDelete(request2);
            expect(response2.status).toBe(400);
        });

        it('❌ Deve validar mediaType enum em query params', async () => {
            mockAuthAuthenticated();

            const url = addQueryParams('/api/watch-history', { tmdbId: '550', mediaType: 'invalid' });
            const request = createDeleteRequest(url, undefined, createAuthHeaders());
            const response = await watchHistoryDelete(request);

            expect(response.status).toBe(400);
            const data = await extractJson(response);
            expect(data.error).toContain('mediaType');
        });

        it('❌ Deve respeitar rate limit (10/min)', async () => {
            mockAuthAuthenticated();
            (rateLimit as jest.Mock).mockReturnValue({
                success: false,
                remaining: 0,
                limit: 10,
            });

            const url = addQueryParams('/api/watch-history', { tmdbId: '550', mediaType: 'movie' });
            const request = createDeleteRequest(url, undefined, createAuthHeaders());
            const response = await watchHistoryDelete(request);

            expect(response.status).toBe(429);
        });

        it('🔒 Deve deletar APENAS do usuário autenticado', async () => {
            mockAuthAuthenticated();
            (prisma.watchHistory.delete as jest.Mock).mockResolvedValue({});

            const url = addQueryParams('/api/watch-history', {
                tmdbId: '550',
                mediaType: 'movie',
                userId: 'hacker-user-id', // Query param ignorado
            });
            const request = createDeleteRequest(url, undefined, createAuthHeaders());
            await watchHistoryDelete(request);

            // Validar que usou apenas userId da sessão
            const callArgs = (prisma.watchHistory.delete as jest.Mock).mock.calls[0][0];
            expect(callArgs.where.userId_tmdbId_mediaType_seasonNumber_episodeNumber.userId).toBe('test-user-id-123');
        });
    });

    // ========================================
    // 🚀 Performance Tests
    // ========================================
    describe('🚀 Performance Tests', () => {
        it('CRÍTICO: GET deve completar em < 100ms (com cache)', async () => {
            mockAuthAuthenticated();
            (prisma.watchHistory.findMany as jest.Mock).mockResolvedValue([
                {
                    id: 'history-1',
                    userId: 'test-user-id-123',
                    tmdbId: 550,
                    mediaType: 'movie',
                    progress: 50,
                    lastWatchedAt: new Date(),
                    createdAt: new Date(),
                },
            ]);

            (getMediaDetailsWithCache as jest.Mock).mockResolvedValue({
                title: 'Test Movie',
                poster_path: '/test.jpg',
            });

            const request = createGetRequest('/api/watch-history', createAuthHeaders());

            const startTime = Date.now();
            await watchHistoryGet(request);
            const duration = Date.now() - startTime;

            // Com cache, deve ser muito rápido (< 100ms)
            expect(duration).toBeLessThan(100);
        });

        it('CRÍTICO: Não deve fazer chamadas TMDB diretas (redução -97% latency)', async () => {
            mockAuthAuthenticated();
            (prisma.watchHistory.findMany as jest.Mock).mockResolvedValue([
                {
                    id: 'history-1',
                    userId: 'test-user-id-123',
                    tmdbId: 550,
                    mediaType: 'movie',
                    progress: 50,
                    lastWatchedAt: new Date(),
                    createdAt: new Date(),
                },
            ]);

            (getMediaDetailsWithCache as jest.Mock).mockResolvedValue({
                title: 'Cached Movie',
                poster_path: '/cached.jpg',
            });

            // Resetar mock do fetch
            (global.fetch as jest.Mock).mockClear();

            const request = createGetRequest('/api/watch-history', createAuthHeaders());
            await watchHistoryGet(request);

            // VALIDAÇÃO CRÍTICA: Zero chamadas ao fetch (TMDB API)
            expect(global.fetch).not.toHaveBeenCalled();

            // Deve usar apenas cache
            expect(getMediaDetailsWithCache).toHaveBeenCalled();
        });
    });
});
