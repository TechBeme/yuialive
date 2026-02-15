/**
 * Testes E2E para Acesso de Streaming em Família
 * 
 * Valida que membros de família podem assistir conteúdo
 * e que o acesso é revogado corretamente.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { prisma } from '@/lib/prisma';
import { hasStreamingAccess, getUserPlanInfo } from '@/lib/access';
import { randomUUID } from 'crypto';

describe('Family Streaming Access', () => {
    let ownerId: string;
    let memberId: string;
    let familyId: string;
    let duoPlanId: string;

    beforeEach(async () => {
        // Limpar dados de teste
        await prisma.familyMember.deleteMany({});
        await prisma.familyInvite.deleteMany({});
        await prisma.family.deleteMany({});
        await prisma.user.deleteMany({
            where: {
                email: {
                    in: [
                        'owner@streaming.test', 
                        'member@streaming.test',
                        'member2@streaming.test',
                        'member3@streaming.test'
                    ],
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

        // Criar owner com plano pago (sem trial)
        const owner = await prisma.user.create({
            data: {
                id: randomUUID(),
                name: 'Owner User',
                email: 'owner@streaming.test',
                emailVerified: true,
                planId: duoPlanId,
                maxScreens: duoPlan.screens,
                trialUsed: true, // Não tem trial
            },
        });

        ownerId = owner.id;

        // Criar membro sem plano
        const member = await prisma.user.create({
            data: {
                id: randomUUID(),
                name: 'Member User',
                email: 'member@streaming.test',
                emailVerified: true,
                trialUsed: true,
            },
        });

        memberId = member.id;

        // Criar família
        const family = await prisma.family.create({
            data: {
                name: 'Test Family',
                ownerId: owner.id,
                maxMembers: duoPlan.screens,
            },
        });

        familyId = family.id;
    });

    describe('Owner Access', () => {
        it('owner com plano pago deve ter acesso ao streaming', async () => {
            const hasAccess = await hasStreamingAccess(ownerId);
            expect(hasAccess).toBe(true);
        });

        it('owner em trial ativo deve ter acesso ao streaming', async () => {
            // Atualizar owner para trial ativo
            const futureDate = new Date();
            futureDate.setDate(futureDate.getDate() + 5); // 5 dias no futuro

            await prisma.user.update({
                where: { id: ownerId },
                data: {
                    trialEndsAt: futureDate,
                },
            });

            const hasAccess = await hasStreamingAccess(ownerId);
            expect(hasAccess).toBe(true);
        });

        it('owner com trial expirado não deve ter acesso', async () => {
            // Atualizar owner para trial expirado
            const pastDate = new Date();
            pastDate.setDate(pastDate.getDate() - 2); // 2 dias no passado

            await prisma.user.update({
                where: { id: ownerId },
                data: {
                    trialEndsAt: pastDate,
                },
            });

            const hasAccess = await hasStreamingAccess(ownerId);
            expect(hasAccess).toBe(false);
        });
    });

    describe('Member Access - BLOCKER FIX', () => {
        it('membro sem família não deve ter acesso', async () => {
            const hasAccess = await hasStreamingAccess(memberId);
            expect(hasAccess).toBe(false);
        });

        it('membro de família com owner ativo deve ter acesso ✅', async () => {
            // Adicionar membro à família
            await prisma.familyMember.create({
                data: {
                    familyId,
                    userId: memberId,
                },
            });

            const hasAccess = await hasStreamingAccess(memberId);
            expect(hasAccess).toBe(true);
        });

        it('membro deve ter acesso quando owner tem trial ativo', async () => {
            // Owner em trial
            const futureDate = new Date();
            futureDate.setDate(futureDate.getDate() + 5);

            await prisma.user.update({
                where: { id: ownerId },
                data: {
                    trialEndsAt: futureDate,
                },
            });

            // Adicionar membro
            await prisma.familyMember.create({
                data: {
                    familyId,
                    userId: memberId,
                },
            });

            const hasAccess = await hasStreamingAccess(memberId);
            expect(hasAccess).toBe(true);
        });

        it('membro perde acesso quando trial do owner expira', async () => {
            // Owner com trial expirado
            const pastDate = new Date();
            pastDate.setDate(pastDate.getDate() - 2);

            await prisma.user.update({
                where: { id: ownerId },
                data: {
                    trialEndsAt: pastDate,
                },
            });

            // Adicionar membro
            await prisma.familyMember.create({
                data: {
                    familyId,
                    userId: memberId,
                },
            });

            const hasAccess = await hasStreamingAccess(memberId);
            expect(hasAccess).toBe(false);
        });

        it('membro perde acesso quando owner cancela plano', async () => {
            // Adicionar membro primeiro
            await prisma.familyMember.create({
                data: {
                    familyId,
                    userId: memberId,
                },
            });

            // Owner cancela plano
            await prisma.user.update({
                where: { id: ownerId },
                data: {
                    planId: null,
                    maxScreens: 1,
                },
            });

            const hasAccess = await hasStreamingAccess(memberId);
            expect(hasAccess).toBe(false);
        });

        it('membro perde acesso quando owner desativa plano', async () => {
            // Adicionar membro
            await prisma.familyMember.create({
                data: {
                    familyId,
                    userId: memberId,
                },
            });

            // Desativar plano do owner
            await prisma.plan.update({
                where: { id: duoPlanId },
                data: { active: false },
            });

            const hasAccess = await hasStreamingAccess(memberId);
   expect(hasAccess).toBe(false);

            // Restaurar plano
            await prisma.plan.update({
                where: { id: duoPlanId },
                data: { active: true },
            });
        });
    });

    describe('getUserPlanInfo - Member Information', () => {
        it('deve retornar info do plano do owner para membro', async () => {
            // Adicionar membro
            await prisma.familyMember.create({
                data: {
                    familyId,
                    userId: memberId,
                },
            });

            const planInfo = await getUserPlanInfo(memberId);

            expect(planInfo).not.toBeNull();
            expect(planInfo?.isOwner).toBe(false);
            expect(planInfo?.planId).toBe(duoPlanId);
            expect(planInfo?.maxScreens).toBe(2);
            expect(planInfo?.isTrial).toBe(false);
        });

        it('deve indicar trial para membro quando owner está em trial', async () => {
            // Owner em trial
            const futureDate = new Date();
            futureDate.setDate(futureDate.getDate() + 5);

            await prisma.user.update({
                where: { id: ownerId },
                data: {
                    trialEndsAt: futureDate,
                },
            });

            // Adicionar membro
            await prisma.familyMember.create({
                data: {
                    familyId,
                    userId: memberId,
                },
            });

            const planInfo = await getUserPlanInfo(memberId);

            expect(planInfo?.isTrial).toBe(true);
            expect(planInfo?.trialEndsAt).not.toBeNull();
        });

        it('deve retornar null para usuário sem plano e sem família', async () => {
            const planInfo = await getUserPlanInfo(memberId);
            expect(planInfo).toBeNull();
        });

        it('owner deve ter isOwner=true', async () => {
            const planInfo = await getUserPlanInfo(ownerId);

            expect(planInfo).not.toBeNull();
            expect(planInfo?.isOwner).toBe(true);
            expect(planInfo?.planId).toBe(duoPlanId);
        });
    });

    describe('Multiple Members', () => {
        it('todos os membros devem ter acesso quando owner tem plano ativo', async () => {
            // Atualizar para plano Família (4 telas)
            const familyPlan = await prisma.plan.findFirst({
                where: { name: 'Família' },
            });

            if (!familyPlan) {
                throw new Error('Plano Família não encontrado');
            }

            await prisma.user.update({
                where: { id: ownerId },
                data: {
                    planId: familyPlan.id,
                    maxScreens: familyPlan.screens,
                },
            });

            await prisma.family.update({
                where: { id: familyId },
                data: { maxMembers: familyPlan.screens },
            });

            // Criar 3 membros
            const member2 = await prisma.user.create({
                data: {
                    id: randomUUID(),
                    name: 'Member 2',
                    email: 'member2@streaming.test',
                    emailVerified: true,
                },
            });

            const member3 = await prisma.user.create({
                data: {
                    id: randomUUID(),
                    name: 'Member 3',
                    email: 'member3@streaming.test',
                    emailVerified: true,
                },
            });

            // Adicionar todos à família
            await prisma.familyMember.createMany({
                data: [
                    { familyId, userId: memberId },
                    { familyId, userId: member2.id },
                    { familyId, userId: member3.id },
                ],
            });

            // Verificar acesso de todos
            const [access1, access2, access3] = await Promise.all([
                hasStreamingAccess(memberId),
                hasStreamingAccess(member2.id),
                hasStreamingAccess(member3.id),
            ]);

            expect(access1).toBe(true);
            expect(access2).toBe(true);
            expect(access3).toBe(true);
        });
    });
});
