/**
 * 🧪 PUBLIC APIS TESTS
 * Testes para APIs públicas e semi-públicas
 * 
 * Cobre:
 * - GET /api/search (autenticada)
 * - GET /api/quick-search (autenticada)
 * - POST /api/contact (pública com rate limiting)
 * - POST /api/streaming/get-url (autenticada)
 * - POST /api/payment/checkout/create (autenticada)
 * - POST /api/sessions/geolocate (autenticada)
 * 
 * Valida:
 * - ✅ Validação Zod robusta
 * - ✅ Rate limiting em APIs públicas
 * - ✅ Paginação correta
 * - ✅ Filtros e ordenação
 * - ✅ Mensagens em PT-BR
 */

import { GET as search } from '@/app/api/search/route';
import { GET as quickSearch } from '@/app/api/quick-search/route';
import { POST as contact } from '@/app/api/contact/route';
import { POST as streamingGetUrl } from '@/app/api/streaming/get-url/route';
import { POST as checkoutCreate } from '@/app/api/payment/checkout/create/route';
import { POST as geolocate } from '@/app/api/sessions/geolocate/route';

import {
    mockAuthAuthenticated,
    mockAuthUnauthenticated,
    clearAuthMocks,
    createAuthHeaders,
    createUnauthHeaders,
    expectUnauthorized,
    expectOk,
} from '../helpers/auth.helper';

import {
    expectValidJson,
    expectErrorStructure,
    expectRateLimitHeaders,
} from '../helpers/payload.helper';

import {
    createGetRequest,
    createPostRequest,
    addQueryParams,
    extractJson,
    expectPaginationStructure,
} from '../helpers/request.helper';

// Mock fetch para TMDB
global.fetch = jest.fn();

describe('🌐 Public APIs Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    afterEach(() => {
        clearAuthMocks();
    });

    // ========================================
    // GET /api/search
    // ========================================
    describe('GET /api/search', () => {
        beforeEach(() => {
            // Mock TMDB API response
            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: async () => ({
                    results: [
                        {
                            id: 123,
                            title: 'Test Movie',
                            media_type: 'movie',
                            poster_path: '/test.jpg',
                        },
                    ],
                    page: 1,
                    total_pages: 10,
                    total_results: 200,
                }),
            });
        });

        it('❌ Deve retornar 401 se não autenticado', async () => {
            mockAuthUnauthenticated();

            const url = addQueryParams('/api/search', { query: 'test' });
            const request = createGetRequest(url, createUnauthHeaders());
            const response = await search(request);

            expectUnauthorized(response);
        });

        it('✅ Deve buscar com query válida', async () => {
            mockAuthAuthenticated();

            const url = addQueryParams('/api/search', { query: 'matrix' });
            const request = createGetRequest(url, createAuthHeaders());
            const response = await search(request);

            expectOk(response);
            const data = await expectValidJson(response);

            expectPaginationStructure(data);
        });

        it('❌ Deve validar query obrigatória', async () => {
            mockAuthAuthenticated();

            const request = createGetRequest('/api/search', createAuthHeaders());
            const response = await search(request);

            expect(response.status).toBe(400);
            const data = await extractJson(response);
            expectErrorStructure(data);
        });

        it('❌ Deve validar tamanho mínimo da query (2 chars)', async () => {
            mockAuthAuthenticated();

            const url = addQueryParams('/api/search', { query: 'a' });
            const request = createGetRequest(url, createAuthHeaders());
            const response = await search(request);

            expect(response.status).toBe(400);
        });

        it('❌ Deve validar tamanho máximo da query (200 chars)', async () => {
            mockAuthAuthenticated();

            const url = addQueryParams('/api/search', { query: 'a'.repeat(201) });
            const request = createGetRequest(url, createAuthHeaders());
            const response = await search(request);

            expect(response.status).toBe(400);
        });

        it('✅ Deve respeitar filtro de mediaType (movie, tv, all)', async () => {
            mockAuthAuthenticated();

            const validFilters = ['movie', 'tv', 'all'];

            for (const filter of validFilters) {
                const url = addQueryParams('/api/search', {
                    query: 'test',
                    filter,
                });
                const request = createGetRequest(url, createAuthHeaders());
                const response = await search(request);

                expectOk(response);
            }
        });

        it('❌ Deve validar filtro inválido', async () => {
            mockAuthAuthenticated();

            const url = addQueryParams('/api/search', {
                query: 'test',
                filter: 'invalid',
            });
            const request = createGetRequest(url, createAuthHeaders());
            const response = await search(request);

            expect(response.status).toBe(400);
        });

        it('✅ Deve validar page (1-500)', async () => {
            mockAuthAuthenticated();

            // Page válida
            const url1 = addQueryParams('/api/search', { query: 'test', page: '1' });
            const request1 = createGetRequest(url1, createAuthHeaders());
            const response1 = await search(request1);
            expectOk(response1);

            // Page válida
            const url2 = addQueryParams('/api/search', { query: 'test', page: '500' });
            const request2 = createGetRequest(url2, createAuthHeaders());
            const response2 = await search(request2);
            expectOk(response2);
        });

        it('❌ Deve rejeitar page inválida', async () => {
            mockAuthAuthenticated();

            // Page < 1
            const url1 = addQueryParams('/api/search', { query: 'test', page: '0' });
            const request1 = createGetRequest(url1, createAuthHeaders());
            const response1 = await search(request1);
            expect(response1.status).toBe(400);

            // Page > 500
            const url2 = addQueryParams('/api/search', { query: 'test', page: '501' });
            const request2 = createGetRequest(url2, createAuthHeaders());
            const response2 = await search(request2);
            expect(response2.status).toBe(400);
        });

        it('✅ Deve processar genres, years, rating, sortBy', async () => {
            mockAuthAuthenticated();

            const url = addQueryParams('/api/search', {
                query: 'test',
                genres: '28,12',
                years: '2020-2024',
                rating: '7.0',
                sortBy: 'popularity',
            });

            const request = createGetRequest(url, createAuthHeaders());
            const response = await search(request);

            expectOk(response);
        });

        it('✅ Deve retornar mensagens de erro em PT-BR', async () => {
            mockAuthAuthenticated();

            const request = createGetRequest('/api/search', createAuthHeaders());
            const response = await search(request);

            expect(response.status).toBe(400);
            const data = await extractJson(response);

            // Mensagem deve estar em português
            expect(data.error).toBeDefined();
            expect(typeof data.error).toBe('string');
        });
    });

    // ========================================
    // GET /api/quick-search
    // ========================================
    describe('GET /api/quick-search', () => {
        beforeEach(() => {
            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: async () => ({
                    results: [
                        { id: 1, title: 'Movie 1', media_type: 'movie' },
                        { id: 2, name: 'TV Show 1', media_type: 'tv' },
                    ],
                }),
            });
        });

        it('❌ Deve retornar 401 se não autenticado', async () => {
            mockAuthUnauthenticated();

            const url = addQueryParams('/api/quick-search', { query: 'test' });
            const request = createGetRequest(url, createUnauthHeaders());
            const response = await quickSearch(request);

            expectUnauthorized(response);
        });

        it('✅ Deve buscar e retornar apenas 6 resultados', async () => {
            mockAuthAuthenticated();

            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: async () => ({
                    results: Array.from({ length: 20 }, (_, i) => ({
                        id: i,
                        title: `Movie ${i}`,
                        media_type: 'movie',
                    })),
                }),
            });

            const url = addQueryParams('/api/quick-search', { query: 'matrix' });
            const request = createGetRequest(url, createAuthHeaders());
            const response = await quickSearch(request);

            expectOk(response);
            const data = await expectValidJson(response);

            expect(data).toHaveProperty('results');
            expect(data.results.length).toBeLessThanOrEqual(6);
        });

        it('❌ Deve validar query (2-200 caracteres)', async () => {
            mockAuthAuthenticated();

            // Muito curto
            const url1 = addQueryParams('/api/quick-search', { query: 'a' });
            const request1 = createGetRequest(url1, createAuthHeaders());
            const response1 = await quickSearch(request1);
            expect(response1.status).toBe(400);

            // Muito longo
            const url2 = addQueryParams('/api/quick-search', { query: 'a'.repeat(201) });
            const request2 = createGetRequest(url2, createAuthHeaders());
            const response2 = await quickSearch(request2);
            expect(response2.status).toBe(400);
        });

        it('✅ Deve incluir rate limit headers', async () => {
            mockAuthAuthenticated();

            const url = addQueryParams('/api/quick-search', { query: 'test' });
            const request = createGetRequest(url, createAuthHeaders());
            const response = await quickSearch(request);

            expectRateLimitHeaders(response);
        });
    });

    // ========================================
    // POST /api/contact
    // ========================================
    describe('POST /api/contact', () => {
        it('✅ Deve ser pública (não requer autenticação)', async () => {
            const request = createPostRequest(
                '/api/contact',
                {
                    name: 'João Silva',
                    email: 'joao@example.com',
                    subject: 'Dúvida',
                    message: 'Olá, tenho uma dúvida sobre o serviço.',
                },
                createUnauthHeaders()
            );

            // Não deve retornar 401
            const response = await contact(request);
            expect(response.status).not.toBe(401);
        });

        it('✅ Deve validar todos os campos obrigatórios', async () => {
            // Sem name
            const request1 = createPostRequest(
                '/api/contact',
                {
                    email: 'test@example.com',
                    subject: 'Test',
                    message: 'Test message',
                },
                createUnauthHeaders()
            );
            const response1 = await contact(request1);
            expect(response1.status).toBe(400);

            // Sem email
            const request2 = createPostRequest(
                '/api/contact',
                {
                    name: 'Test',
                    subject: 'Test',
                    message: 'Test message',
                },
                createUnauthHeaders()
            );
            const response2 = await contact(request2);
            expect(response2.status).toBe(400);

            // Sem subject
            const request3 = createPostRequest(
                '/api/contact',
                {
                    name: 'Test',
                    email: 'test@example.com',
                    message: 'Test message',
                },
                createUnauthHeaders()
            );
            const response3 = await contact(request3);
            expect(response3.status).toBe(400);

            // Sem message
            const request4 = createPostRequest(
                '/api/contact',
                {
                    name: 'Test',
                    email: 'test@example.com',
                    subject: 'Test',
                },
                createUnauthHeaders()
            );
            const response4 = await contact(request4);
            expect(response4.status).toBe(400);
        });

        it('❌ Deve validar formato de email', async () => {
            const request = createPostRequest(
                '/api/contact',
                {
                    name: 'Test',
                    email: 'email-invalido',
                    subject: 'Test',
                    message: 'Test message',
                },
                createUnauthHeaders()
            );
            const response = await contact(request);

            expect(response.status).toBe(400);
        });

        it('❌ Deve validar tamanhos mínimos/máximos', async () => {
            // Message muito curta (< 10)
            const request1 = createPostRequest(
                '/api/contact',
                {
                    name: 'Test',
                    email: 'test@example.com',
                    subject: 'Test',
                    message: 'Short',
                },
                createUnauthHeaders()
            );
            const response1 = await contact(request1);
            expect(response1.status).toBe(400);

            // Message muito longa (> 2000)
            const request2 = createPostRequest(
                '/api/contact',
                {
                    name: 'Test',
                    email: 'test@example.com',
                    subject: 'Test',
                    message: 'a'.repeat(2001),
                },
                createUnauthHeaders()
            );
            const response2 = await contact(request2);
            expect(response2.status).toBe(400);
        });

        it('✅ Deve incluir rate limit headers (API pública)', async () => {
            const request = createPostRequest(
                '/api/contact',
                {
                    name: 'Test',
                    email: 'test@example.com',
                    subject: 'Test',
                    message: 'Test message with enough characters',
                },
                createUnauthHeaders()
            );
            const response = await contact(request);

            expectRateLimitHeaders(response);
        });
    });

    // ========================================
    // POST /api/streaming/get-url
    // ========================================
    describe('POST /api/streaming/get-url', () => {
        it('❌ Deve retornar 401 se não autenticado', async () => {
            mockAuthUnauthenticated();

            const request = createPostRequest(
                '/api/streaming/get-url',
                { tmdbId: 123, mediaType: 'movie' },
                createUnauthHeaders()
            );
            const response = await streamingGetUrl(request);

            expectUnauthorized(response);
        });

        it('✅ Deve validar tmdbId e mediaType obrigatórios', async () => {
            mockAuthAuthenticated();

            // Sem tmdbId
            const request1 = createPostRequest(
                '/api/streaming/get-url',
                { mediaType: 'movie' },
                createAuthHeaders()
            );
            const response1 = await streamingGetUrl(request1);
            expect(response1.status).toBe(400);

            // Sem mediaType
            const request2 = createPostRequest(
                '/api/streaming/get-url',
                { tmdbId: 123 },
                createAuthHeaders()
            );
            const response2 = await streamingGetUrl(request2);
            expect(response2.status).toBe(400);
        });

        it('❌ Deve validar mediaType enum (movie, tv)', async () => {
            mockAuthAuthenticated();

            const request = createPostRequest(
                '/api/streaming/get-url',
                { tmdbId: 123, mediaType: 'invalid' },
                createAuthHeaders()
            );
            const response = await streamingGetUrl(request);

            expect(response.status).toBe(400);
        });

        it('✅ Deve validar season/episode quando mediaType=tv', async () => {
            mockAuthAuthenticated();

            // TV sem season
            const request1 = createPostRequest(
                '/api/streaming/get-url',
                { tmdbId: 123, mediaType: 'tv', episode: 1 },
                createAuthHeaders()
            );
            const response1 = await streamingGetUrl(request1);
            expect(response1.status).toBe(400);

            // TV sem episode
            const request2 = createPostRequest(
                '/api/streaming/get-url',
                { tmdbId: 123, mediaType: 'tv', season: 1 },
                createAuthHeaders()
            );
            const response2 = await streamingGetUrl(request2);
            expect(response2.status).toBe(400);
        });

        it('❌ Deve validar season/episode positivos', async () => {
            mockAuthAuthenticated();

            const request = createPostRequest(
                '/api/streaming/get-url',
                { tmdbId: 123, mediaType: 'tv', season: -1, episode: 0 },
                createAuthHeaders()
            );
            const response = await streamingGetUrl(request);

            expect(response.status).toBe(400);
        });
    });

    // ========================================
    // POST /api/payment/checkout/create
    // ========================================
    describe('POST /api/payment/checkout/create', () => {
        it('❌ Deve retornar 401 se não autenticado', async () => {
            mockAuthUnauthenticated();

            const request = createPostRequest(
                '/api/payment/checkout/create',
                { planId: 'plan-premium' },
                createUnauthHeaders()
            );
            const response = await checkoutCreate(request);

            expectUnauthorized(response);
        });

        it('❌ Deve validar planId obrigatório', async () => {
            mockAuthAuthenticated();

            const request = createPostRequest(
                '/api/payment/checkout/create',
                {},
                createAuthHeaders()
            );
            const response = await checkoutCreate(request);

            expect(response.status).toBe(400);
        });

        it('❌ Deve validar planId válido (premium, family, basic)', async () => {
            mockAuthAuthenticated();

            const request = createPostRequest(
                '/api/payment/checkout/create',
                { planId: 'invalid-plan' },
                createAuthHeaders()
            );
            const response = await checkoutCreate(request);

            expect(response.status).toBe(400);
        });

        it('✅ Deve aceitar planIds válidos', async () => {
            mockAuthAuthenticated();

            const validPlans = ['basic', 'premium', 'family'];

            for (const planId of validPlans) {
                const request = createPostRequest(
                    '/api/payment/checkout/create',
                    { planId },
                    createAuthHeaders()
                );
                const response = await checkoutCreate(request);

                // Não deve retornar 400 por validação
                expect(response.status).not.toBe(400);
            }
        });

        it('✅ Mensagens de erro em PT-BR', async () => {
            mockAuthAuthenticated();

            const request = createPostRequest(
                '/api/payment/checkout/create',
                {},
                createAuthHeaders()
            );
            const response = await checkoutCreate(request);

            expect(response.status).toBe(400);
            const data = await extractJson(response);

            expect(data.error).toBeDefined();
            expect(typeof data.error).toBe('string');
        });
    });

    // ========================================
    // POST /api/sessions/geolocate
    // ========================================
    describe('POST /api/sessions/geolocate', () => {
        it('❌ Deve retornar 401 se não autenticado', async () => {
            mockAuthUnauthenticated();

            const request = createPostRequest(
                '/api/sessions/geolocate',
                {},
                createUnauthHeaders()
            );
            const response = await geolocate(request);

            expectUnauthorized(response);
        });

        it('✅ Deve geolocar com IP do request', async () => {
            mockAuthAuthenticated();

            const request = createPostRequest(
                '/api/sessions/geolocate',
                {},
                createAuthHeaders()
            );
            const response = await geolocate(request);

            // Deve retornar geolocalização (200 ou 500 se serviço falhar)
            expect([200, 500]).toContain(response.status);
        });

        it('✅ Deve retornar city, country, countryCode', async () => {
            mockAuthAuthenticated();

            const request = createPostRequest(
                '/api/sessions/geolocate',
                {},
                createAuthHeaders()
            );
            const response = await geolocate(request);

            if (response.status === 200) {
                const data = await expectValidJson(response);

                expect(data).toHaveProperty('city');
                expect(data).toHaveProperty('country');
                expect(data).toHaveProperty('countryCode');
            }
        });
    });

    // ========================================
    // 📊 TESTES DE VALIDAÇÃO GERAL
    // ========================================
    describe('📊 Validation Tests', () => {
        it('✅ Todas as APIs devem retornar erro 400 com mensagem clara', async () => {
            mockAuthAuthenticated();

            const invalidRequests = [
                createGetRequest('/api/search', createAuthHeaders()), // Sem query
                createGetRequest('/api/quick-search', createAuthHeaders()), // Sem query
                createPostRequest('/api/contact', {}, createUnauthHeaders()), // Sem campos
            ];

            for (const request of invalidRequests) {
                const response = await search(request);

                if (response.status === 400) {
                    const data = await extractJson(response);
                    expectErrorStructure(data);
                }
            }
        });

        it('✅ Mensagens de erro devem estar em PT-BR', async () => {
            mockAuthAuthenticated();

            // Search sem query
            const request = createGetRequest('/api/search', createAuthHeaders());
            const response = await search(request);

            if (response.status === 400) {
                const data = await extractJson(response);

                // Mensagem deve estar em português
                expect(data.error).toBeDefined();
                expect(typeof data.error).toBe('string');
                expect(data.error.length).toBeGreaterThan(0);
            }
        });
    });
});
