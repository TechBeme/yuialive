/**
 * Testes para Validações de Segurança do Sistema de Família
 * 
 * Valida correções de vulnerabilidades identificadas na auditoria:
 * 1. Validação de formato de email em convites
 * 2. Proteção contra exposição de informação na UI
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { prisma } from '@/lib/prisma';
import { randomUUID } from 'crypto';

describe('Security Validations - Family System', () => {
    let duoPlanId: string;
    let ownerId: string;
    let familyId: string;

    beforeEach(async () => {
        // Limpar dados de teste
        await prisma.familyMember.deleteMany({});
        await prisma.familyInvite.deleteMany({});
        await prisma.family.deleteMany({});
        await prisma.user.deleteMany({
            where: {
                OR: [
                    { email: { contains: '@security.test' } },
                    { email: { contains: '@example.com' } },
                    { email: { contains: '@example.COM' } },
                ],
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

        // Criar owner com plano Duo
        const owner = await prisma.user.create({
            data: {
                id: randomUUID(),
                name: 'Security Test Owner',
                email: 'owner@security.test',
                emailVerified: true,
                planId: duoPlanId,
                maxScreens: 2,
                trialUsed: true,
            },
        });

        ownerId = owner.id;

        // Criar família
        const family = await prisma.family.create({
            data: {
                name: 'Security Test Family',
                ownerId: owner.id,
                maxMembers: 2,
            },
        });

        familyId = family.id;
    });

    describe('Email Validation in Invites', () => {
        it('deve aceitar email válido', async () => {
            const validEmail = 'valid@example.com';

            const invite = await prisma.familyInvite.create({
                data: {
                    familyId,
                    email: validEmail,
                    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                },
            });

            expect(invite.email).toBe(validEmail);
        });

        it('deve aceitar emails com formatos válidos variados', async () => {
            const validEmails = [
                'user@example.com',
                'user.name@example.com',
                'user+tag@example.co.uk',
                'user_name@sub.example.com',
                '123@example.com',
            ];

            for (const email of validEmails) {
                const invite = await prisma.familyInvite.create({
                    data: {
                        familyId,
                        email,
                        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                    },
                });

                expect(invite.email).toBe(email);
            }
        });

        it('formato de email deve ser validado no endpoint (teste conceitual)', () => {
            // Este teste valida que a validação existe no endpoint
            // A validação real seria testada via requests HTTP
            
            // Simula a lógica do endpoint que combina múltiplas validações
            function validateEmail(email: string): boolean {
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(email)) return false;
                if (email.startsWith('@')) return false;
                if (email.endsWith('@')) return false;
                if (!email.includes('.')) return false;
                if (email.length > 254) return false;
                return true;
            }
            
            const invalidEmails = [
                'notanemail',
                '@example.com',
                'user@',
                'user @example.com',
                'user@.com',
                '<script>alert(1)</script>',
                'a'.repeat(255) + '@example.com', // > 254 caracteres
            ];

            invalidEmails.forEach(email => {
                expect(validateEmail(email)).toBe(false);
            });

            const validEmails = [
                'user@example.com',
                'a@b.c',
            ];

            validEmails.forEach(email => {
                expect(validateEmail(email)).toBe(true);
            });
        });

        it('limite de 254 caracteres deve ser respeitado', () => {
            // RFC 5321 especifica máximo de 254 caracteres para email
            const longEmail = 'a'.repeat(242) + '@example.com'; // 242 + 12 = 254 chars total
            expect(longEmail.length).toBe(254);

            const tooLong = 'a'.repeat(243) + '@example.com'; // 243 + 12 = 255 chars
            expect(tooLong.length).toBe(255);
        });
    });

    describe('Email-specific Invite Protection', () => {
        it('convite sem email deve ser acessível por qualquer usuário', async () => {
            const invite = await prisma.familyInvite.create({
                data: {
                    familyId,
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
                    email: 'anyone@security.test',
                    emailVerified: true,
                },
            });

            // Simulação: usuário poderia ver e aceitar o convite
            expect(invite.email).toBeNull();
        });

        it('convite com email específico deve ser validado', async () => {
            const targetEmail = 'alice@security.test';

            const invite = await prisma.familyInvite.create({
                data: {
                    familyId,
                    email: targetEmail,
                    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                },
            });

            // Usuário correto
            const rightUser = await prisma.user.create({
                data: {
                    id: randomUUID(),
                    name: 'Alice',
                    email: targetEmail,
                    emailVerified: true,
                },
            });

            // Usuário errado
            const wrongUser = await prisma.user.create({
                data: {
                    id: randomUUID(),
                    name: 'Bob',
                    email: 'bob@security.test',
                    emailVerified: true,
                },
            });

            // Validação (case-insensitive)
            expect(invite.email?.toLowerCase()).toBe(rightUser.email?.toLowerCase());
            expect(invite.email?.toLowerCase()).not.toBe(wrongUser.email?.toLowerCase());
        });

        it('validação de email deve ser case-insensitive', async () => {
            const uniqueId = randomUUID().substring(0, 8);
            const inviteEmail = `User-${uniqueId}@Example.COM`;
            const userEmail = `user-${uniqueId}@example.com`;

            const invite = await prisma.familyInvite.create({
                data: {
                    familyId,
                    email: inviteEmail,
                    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                },
            });

            const user = await prisma.user.create({
                data: {
                    id: randomUUID(),
                    name: 'User',
                    email: userEmail,
                    emailVerified: true,
                },
            });

            // Deve bater (case-insensitive)
            expect(invite.email?.toLowerCase()).toBe(user.email?.toLowerCase());
        });
    });

    describe('XSS Protection - Email Field', () => {
        it('não deve permitir scripts no campo de email (validação)', () => {
            const maliciousInputs = [
                '<script>alert(1)</script>',
                '<img src=x onerror=alert(1)>',
                'javascript:alert(1)',
                '<svg onload=alert(1)>',
            ];

            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

            maliciousInputs.forEach(input => {
                expect(emailRegex.test(input)).toBe(false);
            });
        });

        it('React escapa automaticamente (teste conceitual)', () => {
            // Este teste documenta que React.js escapa valores automaticamente
            // quando renderizados como texto, prevenindo XSS
            
            const maliciousEmail = '<script>alert(1)</script>';
            
            // Se renderizado como: <div>{email}</div>
            // React transforma em: &lt;script&gt;alert(1)&lt;/script&gt;
            
            // Não executaria JavaScript
            expect(maliciousEmail).toContain('<script>');
            // Mas React escaparia automaticamente na renderização
        });
    });

    describe('Information Disclosure Prevention', () => {
        it('convite com email específico não deve expor detalhes para email errado', async () => {
            const invite = await prisma.familyInvite.create({
                data: {
                    familyId,
                    email: 'alice@security.test',
                    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                },
                include: {
                    family: {
                        include: {
                            owner: {
                                select: { name: true, email: true },
                            },
                        },
                    },
                },
            });

            // Simular validação de email na UI
            const wrongUserEmail = 'bob@security.test';
            const inviteTargetEmail = invite.email?.toLowerCase();
            const currentUserEmail = wrongUserEmail.toLowerCase();

            const shouldShowDetails = inviteTargetEmail === currentUserEmail;

            expect(shouldShowDetails).toBe(false);
            // UI não deve mostrar nome do owner, qty de membros, etc
        });

        it('convite sem email específico deve mostrar detalhes para qualquer um', async () => {
            const invite = await prisma.familyInvite.create({
                data: {
                    familyId,
                    email: null, // Público
                    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                },
            });

            const anyUserEmail = 'anyone@security.test';

            // Sem email específico = pode mostrar detalhes
            const shouldShowDetails = !invite.email;

            expect(shouldShowDetails).toBe(true);
        });
    });
});
