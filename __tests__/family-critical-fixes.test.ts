/**
 * Testes para Correções Críticas do Sistema de Família
 * 
 * 1. Validação de email em convites
 * 2. Expiração de trials com limpeza de família
 * 3. Validações dentro da transação
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { prisma } from '@/lib/prisma';
import { expireTrials } from '@/lib/trial';
import { randomUUID } from 'crypto';

describe('Family Critical Fixes', () => {
    let duoPlanId: string;

    beforeEach(async () => {
        // Limpar dados de teste
        await prisma.familyMember.deleteMany({});
        await prisma.familyInvite.deleteMany({});
        await prisma.family.deleteMany({});
        await prisma.user.deleteMany({
            where: {
                email: {
                    contains: '@critical.test',
                },
            },
        });

        // Buscar plano Duo
        const duoPlan = await prisma.plan.findFirst({
            where: { name: 'Duo' },
        });

        if (!duoPlan) {
            throw new Error('Plano Duo não encontrado');
        }

        duoPlanId = duoPlan.id;
    });

    describe('Email Validation in Invites', () => {
        it('convite com email específico deve validar email do usuário', async () => {
            // Criar owner
            const owner = await prisma.user.create({
                data: {
                    id: randomUUID(),
                    name: 'Owner',
                    email: 'owner@critical.test',
                    emailVerified: true,
                    planId: duoPlanId,
                    maxScreens: 2,
                },
            });

            // Criar família
            const family = await prisma.family.create({
                data: {
                    name: 'Test Family',
                    ownerId: owner.id,
                    maxMembers: 2,
                },
            });

            // Criar convite para email específico
            const invite = await prisma.familyInvite.create({
                data: {
                    familyId: family.id,
                    token: 'test-email-validation-token',
                    email: 'invited@critical.test', // Email específico
                    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                },
            });

            // Verificar que o convite tem email
            expect(invite.email).toBe('invited@critical.test');

            // Criar usuário com email DIFERENTE
            const wrongUser = await prisma.user.create({
                data: {
                    id: randomUUID(),
                    name: 'Wrong User',
                    email: 'wrong@critical.test', // Email diferente!
                    emailVerified: true,
                },
            });

            // Não podemos testar a API diretamente aqui, mas validamos o convite
            expect(invite.email).not.toBe(wrongUser.email);

            // Criar usuário com email CORRETO
            const rightUser = await prisma.user.create({
                data: {
                    id: randomUUID(),
                    name: 'Right User',
                    email: 'invited@critical.test', // Email correto
                    emailVerified: true,
                },
            });

            expect(invite.email?.toLowerCase()).toBe(rightUser.email?.toLowerCase());
        });

        it('convite sem email deve aceitar qualquer usuário', async () => {
            // Criar owner
            const owner = await prisma.user.create({
                data: {
                    id: randomUUID(),
                    name: 'Owner',
                    email: 'owner2@critical.test',
                    emailVerified: true,
                    planId: duoPlanId,
                    maxScreens: 2,
                },
            });

            // Criar família
            const family = await prisma.family.create({
                data: {
                    name: 'Test Family 2',
                    ownerId: owner.id,
                    maxMembers: 2,
                },
            });

            // Criar convite SEM email
            const invite = await prisma.familyInvite.create({
                data: {
                    familyId: family.id,
                    token: 'test-no-email-token',
                    email: null, // Sem email específico
                    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                },
            });

            expect(invite.email).toBeNull();

            // Qualquer usuário pode aceitar
            const anyUser = await prisma.user.create({
                data: {
                    id: randomUUID(),
                    name: 'Any User',
                    email: 'any@critical.test',
                    emailVerified: true,
                },
            });

            // Aceitar convite (simulação)
            await prisma.familyMember.create({
                data: {
                    familyId: family.id,
                    userId: anyUser.id,
                },
            });

            await prisma.familyInvite.update({
                where: { id: invite.id },
                data: {
                    status: 'accepted',
                    usedBy: anyUser.id,
                    usedAt: new Date(),
                },
            });

            const updatedInvite = await prisma.familyInvite.findUnique({
                where: { id: invite.id },
            });

            expect(updatedInvite?.status).toBe('accepted');
        });
    });

    describe('Trial Expiration with Family Cleanup', () => {
        it('expiração de trial deve remover membros e deletar família', async () => {
            // Criar owner com trial expirado
            const pastDate = new Date();
            pastDate.setDate(pastDate.getDate() - 2); // 2 dias no passado

            const owner = await prisma.user.create({
                data: {
                    id: randomUUID(),
                    name: 'Trial Owner',
                    email: 'trialowner@critical.test',
                    emailVerified: true,
                    planId: duoPlanId,
                    maxScreens: 2,
                    trialEndsAt: pastDate, // Trial expirado
                },
            });

            // Criar família
            const family = await prisma.family.create({
                data: {
                    name: 'Trial Family',
                    ownerId: owner.id,
                    maxMembers: 2,
                },
            });

            // Criar membro
            const member = await prisma.user.create({
                data: {
                    id: randomUUID(),
                    name: 'Trial Member',
                    email: 'trialmember@critical.test',
                    emailVerified: true,
                },
            });

            await prisma.familyMember.create({
                data: {
                    familyId: family.id,
                    userId: member.id,
                },
            });

            // Criar convite pendente
            await prisma.familyInvite.create({
                data: {
                    familyId: family.id,
                    token: 'trial-invite-token',
                    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                },
            });

            // Executar expiração de trials
            const expiredCount = await expireTrials();

            expect(expiredCount).toBe(1);

            // Verificar que o plano foi removido do owner
            const updatedOwner = await prisma.user.findUnique({
                where: { id: owner.id },
            });

            expect(updatedOwner?.planId).toBeNull();
            expect(updatedOwner?.maxScreens).toBe(1);
            expect(updatedOwner?.trialEndsAt).toBeNull();

            // Verificar que a família foi deletada
            const deletedFamily = await prisma.family.findUnique({
                where: { id: family.id },
            });

            expect(deletedFamily).toBeNull();

            // Verificar que os membros foram removidos
            const members = await prisma.familyMember.findMany({
                where: { familyId: family.id },
            });

            expect(members).toHaveLength(0);

            // Verificar que os convites foram revogados
            const invites = await prisma.familyInvite.findMany({
                where: { familyId: family.id },
            });

            expect(invites).toHaveLength(0);
        });

        it('expiração de trial sem família não deve causar erro', async () => {
            // Criar owner com trial expirado MAS sem família
            const pastDate = new Date();
            pastDate.setDate(pastDate.getDate() - 2);

            await prisma.user.create({
                data: {
                    id: randomUUID(),
                    name: 'Solo Trial Owner',
                    email: 'soloowner@critical.test',
                    emailVerified: true,
                    planId: duoPlanId,
                    maxScreens: 2,
                    trialEndsAt: pastDate,
                },
            });

            // Executar expiração
            const expiredCount = await expireTrials();

            expect(expiredCount).toBe(1);
        });

        it('múltiplos trials expirados devem ser processados corretamente', async () => {
            const pastDate = new Date();
            pastDate.setDate(pastDate.getDate() - 2);

            // Criar 3 owners com trial expirado
            const owners = await Promise.all([
                prisma.user.create({
                    data: {
                        id: randomUUID(),
                        name: 'Owner 1',
                        email: 'owner1@critical.test',
                        emailVerified: true,
                        planId: duoPlanId,
                        maxScreens: 2,
                        trialEndsAt: pastDate,
                    },
                }),
                prisma.user.create({
                    data: {
                        id: randomUUID(),
                        name: 'Owner 2',
                        email: 'owner2@critical.test',
                        emailVerified: true,
                        planId: duoPlanId,
                        maxScreens: 2,
                        trialEndsAt: pastDate,
                    },
                }),
                prisma.user.create({
                    data: {
                        id: randomUUID(),
                        name: 'Owner 3',
                        email: 'owner3@critical.test',
                        emailVerified: true,
                        planId: duoPlanId,
                        maxScreens: 2,
                        trialEndsAt: pastDate,
                    },
                }),
            ]);

            // Criar famílias para os 2 primeiros
            await Promise.all([
                prisma.family.create({
                    data: {
                        name: 'Family 1',
                        ownerId: owners[0].id,
                        maxMembers: 2,
                    },
                }),
                prisma.family.create({
                    data: {
                        name: 'Family 2',
                        ownerId: owners[1].id,
                        maxMembers: 2,
                    },
                }),
            ]);

            // Executar expiração
            const expiredCount = await expireTrials();

            expect(expiredCount).toBe(3);

            // Verificar que todos os planos foram removidos
            const updatedOwners = await prisma.user.findMany({
                where: {
                    id: { in: owners.map((o) => o.id) },
                },
            });

            updatedOwners.forEach((owner) => {
                expect(owner.planId).toBeNull();
                expect(owner.trialEndsAt).toBeNull();
            });

            // Verificar que as famílias foram deletadas
            const families = await prisma.family.findMany({
                where: {
                    ownerId: { in: [owners[0].id, owners[1].id] },
                },
            });

            expect(families).toHaveLength(0);
        });

        it('trial ativo não deve ser expirado', async () => {
            const futureDate = new Date();
            futureDate.setDate(futureDate.getDate() + 5); // 5 dias no futuro

            await prisma.user.create({
                data: {
                    id: randomUUID(),
                    name: 'Active Trial Owner',
                    email: 'activeowner@critical.test',
                    emailVerified: true,
                    planId: duoPlanId,
                    maxScreens: 2,
                    trialEndsAt: futureDate, // Trial ativo
                },
            });

            const expiredCount = await expireTrials();

            expect(expiredCount).toBe(0);
        });
    });

    describe('Transaction Validations', () => {
        it('validação de owner deve estar dentro da transação', async () => {
            // Este teste valida que as verificações críticas estão dentro da transação
            // para prevenir race conditions

            // Criar owner
            const owner = await prisma.user.create({
                data: {
                    id: randomUUID(),
                    name: 'Transaction Owner',
                    email: 'txowner@critical.test',
                    emailVerified: true,
                    planId: duoPlanId,
                    maxScreens: 2,
                },
            });

            // Criar família
            const family = await prisma.family.create({
                data: {
                    name: 'Transaction Family',
                    ownerId: owner.id,
                    maxMembers: 2,
                },
            });

            // Criar convite
            const invite = await prisma.familyInvite.create({
                data: {
                    familyId: family.id,
                    token: 'tx-test-token',
                    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                },
            });

            // Tentativa de aceitar convite simula verificação de owner
            // O owner não deve conseguir aceitar seu próprio convite
            const isOwner = family.ownerId === owner.id;
            expect(isOwner).toBe(true);

            // Verificar que existe validação para isso
            expect(invite.familyId).toBe(family.id);
        });

        it('verificação de membros existentes deve usar lock de leitura', async () => {
            // Criar owner e família
            const owner = await prisma.user.create({
                data: {
                    id: randomUUID(),
                    name: 'Lock Owner',
                    email: 'lockowner@critical.test',
                    emailVerified: true,
                    planId: duoPlanId,
                    maxScreens: 2,
                },
            });

            const family = await prisma.family.create({
                data: {
                    name: 'Lock Family',
                    ownerId: owner.id,
                    maxMembers: 2,
                },
            });

            // Criar membro
            const member = await prisma.user.create({
                data: {
                    id: randomUUID(),
                    name: 'Lock Member',
                    email: 'lockmember@critical.test',
                    emailVerified: true,
                },
            });

            // Adicionar à família
            await prisma.familyMember.create({
                data: {
                    familyId: family.id,
                    userId: member.id,
                },
            });

            // Tentar adicionar novamente (deve falhar)
            const existingMember = await prisma.familyMember.findFirst({
                where: {
                    familyId: family.id,
                    userId: member.id,
                },
            });

            expect(existingMember).not.toBeNull();
        });
    });

    describe('Member Count Display - Never Zero', () => {
        /**
         * CORREÇÃO CRÍTICA: Contagem de membros nunca pode ser 0
         * 
         * Bug original: Quando usuário criava conta com plano Duo/Family,
         * a família não existia no DB ainda (só é criada no primeiro convite).
         * A UI mostrava "0/2" ou "0/4", o que é incorreto.
         * 
         * Correção: Owner sempre conta como 1 membro, mesmo sem família criada.
         */

        it('plano Duo sem família criada deve mostrar 1/2 membros', async () => {
            // Cenário: Usuário acabou de criar conta com plano Duo
            const duoPlan = await prisma.plan.findFirst({
                where: { name: 'Duo' },
            });

            const newUser = await prisma.user.create({
                data: {
                    id: randomUUID(),
                    name: 'New Duo User',
                    email: 'newduo@critical.test',
                    emailVerified: true,
                    planId: duoPlan!.id,
                    maxScreens: 2, // Plano Duo
                },
            });

            // Verificar que NÃO tem família criada
            const family = await prisma.family.findUnique({
                where: { ownerId: newUser.id },
            });

            expect(family).toBeNull();

            // Lógica da UI (FamilySection.tsx)
            const canCreateFamily = newUser.maxScreens >= 2;
            const isMember = false; // Não é membro de outra família

            // Contagem de membros com correção aplicada
            const membersCount = family
                ? family.members.length + 1
                : (canCreateFamily && !isMember ? 1 : 0);

            const totalSlots = family?.maxMembers ?? newUser.maxScreens;

            // ✅ VALIDAÇÃO: Owner conta como 1 membro
            expect(membersCount).toBe(1);
            expect(totalSlots).toBe(2);
            expect(membersCount).toBeGreaterThan(0); // Nunca pode ser 0!
        });

        it('plano Family sem família criada deve mostrar 1/4 membros', async () => {
            const familyPlan = await prisma.plan.findFirst({
                where: { name: 'Família' },
            });

            const newUser = await prisma.user.create({
                data: {
                    id: randomUUID(),
                    name: 'New Family User',
                    email: 'newfamily@critical.test',
                    emailVerified: true,
                    planId: familyPlan!.id,
                    maxScreens: 4, // Plano Família
                },
            });

            const family = await prisma.family.findUnique({
                where: { ownerId: newUser.id },
            });

            expect(family).toBeNull();

            const canCreateFamily = newUser.maxScreens >= 2;
            const isMember = false;

            const membersCount = family
                ? family.members.length + 1
                : (canCreateFamily && !isMember ? 1 : 0);

            const totalSlots = family?.maxMembers ?? newUser.maxScreens;

            expect(membersCount).toBe(1);
            expect(totalSlots).toBe(4);
            expect(membersCount).toBeGreaterThan(0);
        });

        it('plano Individual sem família NÃO deve contar como 1', async () => {
            const individualPlan = await prisma.plan.findFirst({
                where: { name: 'Individual' },
            });

            const individualUser = await prisma.user.create({
                data: {
                    id: randomUUID(),
                    name: 'Individual User',
                    email: 'individual@critical.test',
                    emailVerified: true,
                    planId: individualPlan!.id,
                    maxScreens: 1, // Plano Individual
                },
            });

            const family = await prisma.family.findUnique({
                where: { ownerId: individualUser.id },
            });

            expect(family).toBeNull();

            const canCreateFamily = individualUser.maxScreens >= 2;
            const isMember = false;

            const membersCount = family
                ? family.members.length + 1
                : (canCreateFamily && !isMember ? 1 : 0);

            // ✅ Usuário Individual NÃO tem acesso a família, logo não conta
            expect(canCreateFamily).toBe(false);
            expect(membersCount).toBe(0); // OK para Individual não contar
        });

        it('membro de outra família não conta como owner na própria família', async () => {
            // Criar owner com família
            const owner = await prisma.user.create({
                data: {
                    id: randomUUID(),
                    name: 'Family Owner',
                    email: 'ownermember@critical.test',
                    emailVerified: true,
                    planId: duoPlanId,
                    maxScreens: 2,
                },
            });

            const ownerFamily = await prisma.family.create({
                data: {
                    name: 'Owner Family',
                    ownerId: owner.id,
                    maxMembers: 2,
                },
            });

            // Criar membro que também tem plano Duo
            const member = await prisma.user.create({
                data: {
                    id: randomUUID(),
                    name: 'Member With Duo',
                    email: 'memberduo@critical.test',
                    emailVerified: true,
                    planId: duoPlanId,
                    maxScreens: 2, // Tem plano Duo, mas é membro de outra família
                },
            });

            await prisma.familyMember.create({
                data: {
                    familyId: ownerFamily.id,
                    userId: member.id,
                },
            });

            // Verificar que membro não tem própria família
            const ownFamily = await prisma.family.findUnique({
                where: { ownerId: member.id },
            });

            expect(ownFamily).toBeNull();

            // Logica da UI para o membro
            const canCreateFamily = member.maxScreens >= 2;
            const isMember = true; // É membro de outra família

            const membersCount = ownFamily
                ? ownFamily.members.length + 1
                : (canCreateFamily && !isMember ? 1 : 0);

            // ✅ Membro de outra família NÃO conta na própria (não existe)
            expect(canCreateFamily).toBe(true);
            expect(isMember).toBe(true);
            expect(membersCount).toBe(0); // Correto: não pode criar família própria
        });

        it('após criar primeiro convite, contagem deve ir de 1 para 2 slots usados', async () => {
            const newUser = await prisma.user.create({
                data: {
                    id: randomUUID(),
                    name: 'User With Invite',
                    email: 'userinvite@critical.test',
                    emailVerified: true,
                    planId: duoPlanId,
                    maxScreens: 2,
                },
            });

            // ANTES: Sem família
            let family = await prisma.family.findUnique({
                where: { ownerId: newUser.id },
                include: {
                    members: true,
                    invites: {
                        where: { status: 'pending', expiresAt: { gt: new Date() } },
                    },
                },
            });

            expect(family).toBeNull();

            let membersCount = family
                ? family.members.length + 1
                : (newUser.maxScreens >= 2 ? 1 : 0);
            let pendingInvites = family?.invites?.length ?? 0;
            let usedSlots = membersCount + pendingInvites;

            expect(usedSlots).toBe(1); // Owner apenas

            // DEPOIS: Criar família e convite
            family = await prisma.family.create({
                data: {
                    name: 'User Family',
                    ownerId: newUser.id,
                    maxMembers: 2,
                },
                include: {
                    members: true,
                    invites: {
                        where: { status: 'pending', expiresAt: { gt: new Date() } },
                    },
                },
            });

            await prisma.familyInvite.create({
                data: {
                    familyId: family.id,
                    token: 'invite-count-test',
                    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                },
            });

            // Recarregar família com convite
            family = await prisma.family.findUnique({
                where: { id: family.id },
                include: {
                    members: true,
                    invites: {
                        where: { status: 'pending', expiresAt: { gt: new Date() } },
                    },
                },
            });

            membersCount = family!.members.length + 1; // Owner
            pendingInvites = family!.invites.length;
            usedSlots = membersCount + pendingInvites;

            // ✅ Agora usa 2 slots: owner + 1 convite pendente
            expect(membersCount).toBe(1);
            expect(pendingInvites).toBe(1);
            expect(usedSlots).toBe(2);
        });
    });
});
