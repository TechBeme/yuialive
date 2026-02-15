/**
 * 🧪 FAMILY API TESTS
 * Testes completos para /api/family/*
 * 
 * Valida:
 * - ✅ Autenticação obrigatória
 * - ✅ Payload otimizado (sem dados sensíveis como emails de membros)
 * - ✅ 204 No Content em POST/DELETE
 * - ✅ Validação CUID (não UUID) - BUG CRÍTICO CORRIGIDO
 * - ✅ Segurança (userId da sessão apenas)
 * - ✅ Proteção de privacidade
 */

import { GET as familyGet } from '@/app/api/family/route';
import { POST as familyInviteCreate } from '@/app/api/family/invite/route';
import { DELETE as familyInviteDelete } from '@/app/api/family/invite/route';
import { POST as familyAccept } from '@/app/api/family/accept/route';
import { DELETE as familyMemberRemove } from '@/app/api/family/members/route';
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
    expectNoSensitiveData,
    expectValidJson,
    expectEmptyBody,
    expectErrorStructure,
    expectNestedNoSensitiveData,
} from '../helpers/payload.helper';

import {
    createGetRequest,
    createPostRequest,
    createDeleteRequest,
    extractJson,
} from '../helpers/request.helper';

// Mock Prisma
jest.mock('@/lib/prisma', () => ({
    prisma: {
        family: {
            findUnique: jest.fn(),
            create: jest.fn(),
        },
        familyMember: {
            findFirst: jest.fn(),
            findUnique: jest.fn(),
            delete: jest.fn(),
        },
        familyInvite: {
            create: jest.fn(),
            delete: jest.fn(),
            findUnique: jest.fn(),
            update: jest.fn(),
        },
        user: {
            findUnique: jest.fn(),
        },
        $transaction: jest.fn(),
    },
}));

describe('👨‍👩‍👧‍👦 Family API Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    afterEach(() => {
        clearAuthMocks();
    });

    // ========================================
    // GET /api/family
    // ========================================
    describe('GET /api/family', () => {
        it('❌ Deve retornar 401 se não autenticado', async () => {
            mockAuthUnauthenticated();

            const request = createGetRequest('/api/family', createUnauthHeaders());
            const response = await familyGet(request);

            expectUnauthorized(response);
        });

        it('✅ Deve retornar apenas dados essenciais (SEM emails de membros)', async () => {
            mockAuthAuthenticated();

            const mockFamily = {
                id: 'family-1',
                name: 'Família Silva',
                maxMembers: 5,
                ownerId: 'test-user-id-123',
                members: [
                    {
                        id: 'member-1',
                        userId: 'user-1',
                        familyId: 'family-1',
                        joinedAt: new Date(),
                        user: {
                            id: 'user-1',
                            name: 'João Silva',
                            email: 'joao@example.com', // ❌ NÃO deve aparecer
                        },
                    },
                    {
                        id: 'member-2',
                        userId: 'user-2',
                        familyId: 'family-1',
                        joinedAt: new Date(),
                        user: {
                            id: 'user-2',
                            name: 'Maria Silva',
                            email: 'maria@example.com', // ❌ NÃO deve aparecer
                        },
                    },
                ],
                invites: [
                    {
                        id: 'invite-1',
                        token: 'abc123def456',
                        email: 'convidado@example.com',
                        familyId: 'family-1',
                        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                        createdAt: new Date(),
                        usedBy: null,
                        usedAt: null,
                    },
                ],
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            (prisma.family.findUnique as jest.Mock).mockResolvedValue(mockFamily);
            (prisma.familyMember.findFirst as jest.Mock).mockResolvedValue(null);

            const request = createGetRequest('/api/family', createAuthHeaders());
            const response = await familyGet(request);

            expectOk(response);
            const data = await expectValidJson(response);

            expect(data).toHaveProperty('ownedFamily');

            if (data.ownedFamily) {
                // Validar campos da família
                expectOnlyFields(data.ownedFamily, ['id', 'name', 'maxMembers', 'members', 'invites']);

                // 🔒 CRÍTICO: Validar que membros NÃO têm emails
                data.ownedFamily.members.forEach((member: any) => {
                    expectOnlyFields(member, ['id', 'joinedAt', 'user']);
                    expectOnlyFields(member.user, ['name']); // ✅ APENAS name

                    // Garantir que email NÃO está presente
                    expectNoSensitiveData(member.user, ['email', 'id', 'createdAt', 'updatedAt']);
                });

                // Validar campos de invites
                data.ownedFamily.invites.forEach((invite: any) => {
                    expectOnlyFields(invite, ['id', 'token', 'email', 'expiresAt']);

                    // NÃO deve ter campos internos
                    expectNoSensitiveData(invite, ['familyId', 'createdAt', 'usedBy', 'usedAt']);
                });
            }
        });

        it('✅ Deve retornar null se usuário não tem família', async () => {
            mockAuthAuthenticated();

            (prisma.family.findUnique as jest.Mock).mockResolvedValue(null);
            (prisma.familyMember.findFirst as jest.Mock).mockResolvedValue(null);

            const request = createGetRequest('/api/family', createAuthHeaders());
            const response = await familyGet(request);

            expectOk(response);
            const data = await expectValidJson(response);

            expect(data.ownedFamily).toBeNull();
            expect(data.membership).toBeNull();
        });

        it('✅ Deve retornar membership se é membro (não owner)', async () => {
            mockAuthAuthenticated();

            const mockMembership = {
                id: 'member-1',
                userId: 'test-user-id-123',
                familyId: 'family-1',
                joinedAt: new Date(),
                family: {
                    id: 'family-1',
                    name: 'Família de Outro',
                    maxMembers: 5,
                    ownerId: 'other-user-id',
                    owner: {
                        id: 'other-user-id',
                        name: 'Outro Owner',
                        email: 'owner@example.com', // ❌ NÃO deve aparecer
                    },
                    members: [],
                    invites: [],
                },
            };

            (prisma.family.findUnique as jest.Mock).mockResolvedValue(null);
            (prisma.familyMember.findFirst as jest.Mock).mockResolvedValue(mockMembership);

            const request = createGetRequest('/api/family', createAuthHeaders());
            const response = await familyGet(request);

            expectOk(response);
            const data = await expectValidJson(response);

            expect(data.ownedFamily).toBeNull();
            expect(data.membership).toBeDefined();

            // Validar que owner.email NÃO aparece
            expectOnlyFields(data.membership.family.owner, ['name']);
            expectNoSensitiveData(data.membership.family.owner, ['email', 'id']);
        });
    });

    // ========================================
    // POST /api/family/invite
    // ========================================
    describe('POST /api/family/invite', () => {
        it('❌ Deve retornar 401 se não autenticado', async () => {
            mockAuthUnauthenticated();

            const request = createPostRequest(
                '/api/family/invite',
                { email: 'convidado@example.com' },
                createUnauthHeaders()
            );
            const response = await familyInviteCreate(request);

            expectUnauthorized(response);
        });

        it('✅ Deve retornar 204 No Content ao criar convite', async () => {
            mockAuthAuthenticated();

            (prisma.family.findUnique as jest.Mock).mockResolvedValue({
                id: 'family-1',
                ownerId: 'test-user-id-123',
                maxMembers: 5,
                members: [],
                invites: [],
            });

            (prisma.familyInvite.create as jest.Mock).mockResolvedValue({
                id: 'invite-1',
                token: 'abc123',
                email: 'convidado@example.com',
            });

            const request = createPostRequest(
                '/api/family/invite',
                { email: 'convidado@example.com' },
                createAuthHeaders()
            );
            const response = await familyInviteCreate(request);

            await expectEmptyBody(response);
        });

        it('❌ Deve validar email obrigatório', async () => {
            mockAuthAuthenticated();

            const request = createPostRequest(
                '/api/family/invite',
                {},
                createAuthHeaders()
            );
            const response = await familyInviteCreate(request);

            expect(response.status).toBe(400);
        });

        it('❌ Deve validar formato de email', async () => {
            mockAuthAuthenticated();

            const request = createPostRequest(
                '/api/family/invite',
                { email: 'email-invalido' },
                createAuthHeaders()
            );
            const response = await familyInviteCreate(request);

            expect(response.status).toBe(400);
        });

        it('❌ Deve bloquear se não é owner da família', async () => {
            mockAuthAuthenticated();

            (prisma.family.findUnique as jest.Mock).mockResolvedValue({
                id: 'family-1',
                ownerId: 'other-user-id', // ❌ Outro usuário é owner
                maxMembers: 5,
            });

            const request = createPostRequest(
                '/api/family/invite',
                { email: 'test@example.com' },
                createAuthHeaders()
            );
            const response = await familyInviteCreate(request);

            expect(response.status).toBe(403);
        });

        it('❌ Deve bloquear se já atingiu limite de membros', async () => {
            mockAuthAuthenticated();

            (prisma.family.findUnique as jest.Mock).mockResolvedValue({
                id: 'family-1',
                ownerId: 'test-user-id-123',
                maxMembers: 2,
                members: [{ id: 'm1' }, { id: 'm2' }],
                invites: [],
            });

            const request = createPostRequest(
                '/api/family/invite',
                { email: 'test@example.com' },
                createAuthHeaders()
            );
            const response = await familyInviteCreate(request);

            expect(response.status).toBe(400);
        });
    });

    // ========================================
    // DELETE /api/family/invite
    // ========================================
    describe('DELETE /api/family/invite', () => {
        it('❌ Deve retornar 401 se não autenticado', async () => {
            mockAuthUnauthenticated();

            const request = createDeleteRequest(
                '/api/family/invite',
                { token: 'abc123' },
                createUnauthHeaders()
            );
            const response = await familyInviteDelete(request);

            expectUnauthorized(response);
        });

        it('✅ Deve retornar 204 No Content ao deletar convite', async () => {
            mockAuthAuthenticated();

            (prisma.familyInvite.findUnique as jest.Mock).mockResolvedValue({
                id: 'invite-1',
                token: 'abc123',
                familyId: 'family-1',
                family: {
                    ownerId: 'test-user-id-123',
                },
            });

            (prisma.familyInvite.delete as jest.Mock).mockResolvedValue({
                id: 'invite-1',
            });

            const request = createDeleteRequest(
                '/api/family/invite',
                { token: 'abc123' },
                createAuthHeaders()
            );
            const response = await familyInviteDelete(request);

            await expectEmptyBody(response);
        });

        it('✅ Deve validar token como CUID (não UUID)', async () => {
            mockAuthAuthenticated();

            // Token UUID (formato antigo - deve falhar)
            const uuidToken = '123e4567-e89b-12d3-a456-426614174000';

            const request = createDeleteRequest(
                '/api/family/invite',
                { token: uuidToken },
                createAuthHeaders()
            );
            const response = await familyInviteDelete(request);

            // Deve validar como CUID, não UUID
            expect(response.status).toBe(400);
            const data = await extractJson(response);
            expect(data.error).toContain('token');
        });

        it('✅ Deve aceitar token CUID válido', async () => {
            mockAuthAuthenticated();

            // Token CUID válido (formato Prisma)
            const cuidToken = 'clxxxxxxxxxxxxxxxxxxxxx';

            (prisma.familyInvite.findUnique as jest.Mock).mockResolvedValue({
                id: 'invite-1',
                token: cuidToken,
                familyId: 'family-1',
                family: {
                    ownerId: 'test-user-id-123',
                },
            });

            (prisma.familyInvite.delete as jest.Mock).mockResolvedValue({ id: 'i1' });

            const request = createDeleteRequest(
                '/api/family/invite',
                { token: cuidToken },
                createAuthHeaders()
            );
            const response = await familyInviteDelete(request);

            expectNoContent(response);
        });

        it('❌ Deve bloquear se não é owner da família', async () => {
            mockAuthAuthenticated();

            (prisma.familyInvite.findUnique as jest.Mock).mockResolvedValue({
                id: 'invite-1',
                token: 'abc123',
                familyId: 'family-1',
                family: {
                    ownerId: 'other-user-id', // ❌ Outro usuário
                },
            });

            const request = createDeleteRequest(
                '/api/family/invite',
                { token: 'abc123' },
                createAuthHeaders()
            );
            const response = await familyInviteDelete(request);

            expect(response.status).toBe(403);
        });
    });

    // ========================================
    // POST /api/family/accept
    // ========================================
    describe('POST /api/family/accept', () => {
        it('❌ Deve retornar 401 se não autenticado', async () => {
            mockAuthUnauthenticated();

            const request = createPostRequest(
                '/api/family/accept',
                { token: 'abc123' },
                createUnauthHeaders()
            );
            const response = await familyAccept(request);

            expectUnauthorized(response);
        });

        it('✅ Deve validar token como CUID (não UUID)', async () => {
            mockAuthAuthenticated();

            // Token UUID (deve falhar)
            const uuidToken = '123e4567-e89b-12d3-a456-426614174000';

            const request = createPostRequest(
                '/api/family/accept',
                { token: uuidToken },
                createAuthHeaders()
            );
            const response = await familyAccept(request);

            expect(response.status).toBe(400);
        });

        it('✅ Deve aceitar convite com token CUID válido', async () => {
            mockAuthAuthenticated();

            const cuidToken = 'clxxxxxxxxxxxxxxxxxxxxx';

            (prisma.familyInvite.findUnique as jest.Mock).mockResolvedValue({
                id: 'invite-1',
                token: cuidToken,
                familyId: 'family-1',
                email: 'test@example.com',
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                usedBy: null,
                family: {
                    id: 'family-1',
                    maxMembers: 5,
                    members: [],
                },
            });

            (prisma.user.findUnique as jest.Mock).mockResolvedValue({
                id: 'test-user-id-123',
                email: 'test@example.com',
            });

            (prisma.$transaction as jest.Mock).mockResolvedValue({});

            const request = createPostRequest(
                '/api/family/accept',
                { token: cuidToken },
                createAuthHeaders()
            );
            const response = await familyAccept(request);

            expectOk(response);
        });

        it('❌ Deve bloquear convite expirado', async () => {
            mockAuthAuthenticated();

            (prisma.familyInvite.findUnique as jest.Mock).mockResolvedValue({
                id: 'invite-1',
                token: 'abc123',
                familyId: 'family-1',
                email: 'test@example.com',
                expiresAt: new Date(Date.now() - 1000), // ❌ Expirado
                usedBy: null,
            });

            const request = createPostRequest(
                '/api/family/accept',
                { token: 'abc123' },
                createAuthHeaders()
            );
            const response = await familyAccept(request);

            expect(response.status).toBe(400);
        });

        it('❌ Deve bloquear convite já usado', async () => {
            mockAuthAuthenticated();

            (prisma.familyInvite.findUnique as jest.Mock).mockResolvedValue({
                id: 'invite-1',
                token: 'abc123',
                familyId: 'family-1',
                email: 'test@example.com',
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                usedBy: 'other-user-id', // ❌ Já usado
            });

            const request = createPostRequest(
                '/api/family/accept',
                { token: 'abc123' },
                createAuthHeaders()
            );
            const response = await familyAccept(request);

            expect(response.status).toBe(400);
        });

        it('❌ Deve bloquear usuário com plano ativo de entrar na família', async () => {
            mockAuthAuthenticated();

            const cuidToken = 'clxxxxxxxxxxxxxxxxxxxxx';

            (prisma.familyInvite.findUnique as jest.Mock).mockResolvedValue({
                id: 'invite-1',
                token: cuidToken,
                familyId: 'family-1',
                status: 'pending',
                email: 'test@example.com',
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                usedBy: null,
                family: {
                    id: 'family-1',
                    maxMembers: 5,
                    members: [],
                    owner: {
                        id: 'owner-id',
                        name: 'Owner',
                    },
                },
            });

            (prisma.user.findUnique as jest.Mock).mockResolvedValue({
                id: 'test-user-id-123',
                email: 'test@example.com',
            });

            // Mock da transação que lança erro HAS_ACTIVE_PLAN
            (prisma.$transaction as jest.Mock).mockImplementation(() => {
                throw new Error('HAS_ACTIVE_PLAN');
            });

            const request = createPostRequest(
                '/api/family/accept',
                { token: cuidToken },
                createAuthHeaders()
            );
            const response = await familyAccept(request);

            expect(response.status).toBe(409);
            const data = await extractJson(response);
            expect(data.error).toBe('api.family.activePlan');
        });
    });

    // ========================================
    // DELETE /api/family/members
    // ========================================
    describe('DELETE /api/family/members', () => {
        it('❌ Deve retornar 401 se não autenticado', async () => {
            mockAuthUnauthenticated();

            const request = createDeleteRequest(
                '/api/family/members',
                { memberId: 'member-123' },
                createUnauthHeaders()
            );
            const response = await familyMemberRemove(request);

            expectUnauthorized(response);
        });

        it('✅ Deve retornar 204 No Content ao remover membro', async () => {
            mockAuthAuthenticated();

            (prisma.familyMember.delete as jest.Mock).mockResolvedValue({
                id: 'member-1',
            });

            // Mock para verificar ownership
            (prisma.family.findUnique as jest.Mock).mockResolvedValue({
                id: 'family-1',
                ownerId: 'test-user-id-123',
            });

            const request = createDeleteRequest(
                '/api/family/members',
                { memberId: 'clxxxxxxxxxxxxxxxxxxxxx' },
                createAuthHeaders()
            );
            const response = await familyMemberRemove(request);

            await expectEmptyBody(response);
        });

        it('✅ Deve validar memberId como CUID (não UUID)', async () => {
            mockAuthAuthenticated();

            // UUID (deve falhar)
            const uuidMemberId = '123e4567-e89b-12d3-a456-426614174000';

            const request = createDeleteRequest(
                '/api/family/members',
                { memberId: uuidMemberId },
                createAuthHeaders()
            );
            const response = await familyMemberRemove(request);

            expect(response.status).toBe(400);
            const data = await extractJson(response);
            expect(data.error).toContain('memberId');
        });
    });

    // ========================================
    // 🔒 TESTES DE SEGURANÇA E PRIVACIDADE
    // ========================================
    describe('🔒 Security & Privacy Tests', () => {
        it('🔒 GET family NÃO deve expor emails de membros', async () => {
            mockAuthAuthenticated();

            const mockFamily = {
                id: 'family-1',
                name: 'Test Family',
                maxMembers: 5,
                members: [
                    {
                        id: 'member-1',
                        joinedAt: new Date(),
                        user: {
                            id: 'user-1',
                            name: 'User 1',
                            email: 'secret@example.com', // ❌ Deve ser filtrado
                        },
                    },
                ],
                invites: [],
            };

            (prisma.family.findUnique as jest.Mock).mockResolvedValue(mockFamily);
            (prisma.familyMember.findFirst as jest.Mock).mockResolvedValue(null);

            const request = createGetRequest('/api/family', createAuthHeaders());
            const response = await familyGet(request);

            const data = await expectValidJson(response);

            // Garantir que email NÃO está na resposta
            data.ownedFamily.members.forEach((member: any) => {
                expect(member.user).not.toHaveProperty('email');
                expect(member.user).not.toHaveProperty('id');
            });
        });

        it('✅ SEMPRE deve usar userId da sessão (nunca do body)', async () => {
            mockAuthAuthenticated();

            (prisma.family.findUnique as jest.Mock).mockResolvedValue(null);
            (prisma.familyMember.findFirst as jest.Mock).mockResolvedValue(null);

            const request = createGetRequest('/api/family', createAuthHeaders());
            await familyGet(request);

            // Deve consultar com userId da sessão
            expect(prisma.family.findUnique).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { ownerId: 'test-user-id-123' },
                })
            );
        });
    });
});
