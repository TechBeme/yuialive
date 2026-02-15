import { describe, it, expect } from '@jest/globals';
import {
    calculateAvailableSlots,
    hasAvailableSlots,
    getTotalMembersCount,
} from '../lib/family';

describe('Family Plan Logic', () => {
    describe('calculateAvailableSlots', () => {
        it('should calculate correctly for Duo plan (maxMembers=2)', () => {
            // Duo: owner + 1 slot adicional
            expect(calculateAvailableSlots(2, 0)).toBe(1); // 0 membros = 1 slot disponível
            expect(calculateAvailableSlots(2, 1)).toBe(0); // 1 membro = 0 slots disponíveis
        });

        it('should calculate correctly for Family plan (maxMembers=4)', () => {
            // Família: owner + 3 slots adicionais
            expect(calculateAvailableSlots(4, 0)).toBe(3); // 0 membros = 3 slots disponíveis
            expect(calculateAvailableSlots(4, 1)).toBe(2); // 1 membro = 2 slots disponíveis
            expect(calculateAvailableSlots(4, 2)).toBe(1); // 2 membros = 1 slot disponível
            expect(calculateAvailableSlots(4, 3)).toBe(0); // 3 membros = 0 slots disponíveis
        });
    });

    describe('hasAvailableSlots', () => {
        it('should return true when slots are available - Duo plan', () => {
            // Duo com 0 membros, 0 convites pendentes
            expect(hasAvailableSlots(2, 0, 0)).toBe(true);
        });

        it('should return false when pending invites occupy all slots - Duo plan', () => {
            // Duo com 0 membros, mas 1 convite pendente (ocupa o único slot)
            expect(hasAvailableSlots(2, 0, 1)).toBe(false);
        });

        it('should return false when family is full - Duo plan', () => {
            // Duo com 1 membro (limite atingido)
            expect(hasAvailableSlots(2, 1, 0)).toBe(false);
        });

        it('should return true when slots are available - Family plan', () => {
            // Família com 1 membro, 0 convites pendentes (2 slots disponíveis)
            expect(hasAvailableSlots(4, 1, 0)).toBe(true);
            
            // Família com 1 membro, 1 convite pendente (ainda sobra 1 slot)
            expect(hasAvailableSlots(4, 1, 1)).toBe(true);
        });

        it('should return false when pending invites occupy all slots - Family plan', () => {
            // Família com 1 membro, 2 convites pendentes (ocupa os 2 slots disponíveis)
            expect(hasAvailableSlots(4, 1, 2)).toBe(false);
            
            // Família com 0 membros, 3 convites pendentes (ocupa os 3 slots disponíveis)
            expect(hasAvailableSlots(4, 0, 3)).toBe(false);
        });

        it('should return false when family is full - Family plan', () => {
            // Família com 3 membros (limite atingido)
            expect(hasAvailableSlots(4, 3, 0)).toBe(false);
        });
    });

    describe('getTotalMembersCount', () => {
        it('should include owner in count', () => {
            expect(getTotalMembersCount(0)).toBe(1); // owner apenas
            expect(getTotalMembersCount(1)).toBe(2); // owner + 1 membro
            expect(getTotalMembersCount(3)).toBe(4); // owner + 3 membros
        });
    });

    describe('Real-world scenarios', () => {
        describe('Duo Plan (maxMembers=2)', () => {
            it('should allow creating 1 invite when empty', () => {
                const maxMembers = 2;
                const currentMembers = 0;
                const pendingInvites = 0;
                
                expect(hasAvailableSlots(maxMembers, currentMembers, pendingInvites)).toBe(true);
            });

            it('should NOT allow creating 2nd invite when 1 is pending', () => {
                const maxMembers = 2;
                const currentMembers = 0;
                const pendingInvites = 1;
                
                expect(hasAvailableSlots(maxMembers, currentMembers, pendingInvites)).toBe(false);
            });

            it('should NOT allow creating invite when family is full', () => {
                const maxMembers = 2;
                const currentMembers = 1; // owner + 1 membro = full
                const pendingInvites = 0;
                
                expect(hasAvailableSlots(maxMembers, currentMembers, pendingInvites)).toBe(false);
            });

            it('should allow creating invite after member leaves', () => {
                const maxMembers = 2;
                const currentMembers = 0; // membro saiu
                const pendingInvites = 0;
                
                expect(hasAvailableSlots(maxMembers, currentMembers, pendingInvites)).toBe(true);
            });
        });

        describe('Family Plan (maxMembers=4)', () => {
            it('should allow creating up to 3 invites when empty', () => {
                const maxMembers = 4;
                const currentMembers = 0;
                
                // Pode criar 1º convite
                expect(hasAvailableSlots(maxMembers, currentMembers, 0)).toBe(true);
                
                // Pode criar 2º convite
                expect(hasAvailableSlots(maxMembers, currentMembers, 1)).toBe(true);
                
                // Pode criar 3º convite
                expect(hasAvailableSlots(maxMembers, currentMembers, 2)).toBe(true);
                
                // NÃO pode criar 4º convite
                expect(hasAvailableSlots(maxMembers, currentMembers, 3)).toBe(false);
            });

            it('should manage slots correctly with members and invites', () => {
                const maxMembers = 4;
                
                // Cenário: 1 membro ativo + 1 convite pendente
                // Slots: 4 - 1(owner) - 1(membro) = 2 disponíveis
                // Convites pendentes: 1
                // Pode criar mais convite? Sim (2 slots - 1 pendente = 1 disponível)
                expect(hasAvailableSlots(maxMembers, 1, 1)).toBe(true);
                
                // Cenário: 1 membro ativo + 2 convites pendentes
                // Pode criar mais convite? Não (2 slots - 2 pendentes = 0)
                expect(hasAvailableSlots(maxMembers, 1, 2)).toBe(false);
            });

            it('should NOT allow invite when family is full', () => {
                const maxMembers = 4;
                const currentMembers = 3; // owner + 3 membros = full
                const pendingInvites = 0;
                
                expect(hasAvailableSlots(maxMembers, currentMembers, pendingInvites)).toBe(false);
            });
        });
    });
});
