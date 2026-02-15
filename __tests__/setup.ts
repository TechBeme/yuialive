/**
 * 🛠️ JEST SETUP
 * Configuração global para os testes
 */

// Mock do better-auth antes de qualquer import
jest.mock('better-auth', () => ({
    betterAuth: jest.fn(() => ({
        handler: jest.fn(),
        api: {
            getSession: jest.fn(),
        },
    })),
}));

// Mock do better-auth/adapters/prisma
jest.mock('better-auth/adapters/prisma', () => ({
    prismaAdapter: jest.fn(),
}));

// Mock do better-auth/plugins
jest.mock('better-auth/plugins', () => ({
    emailOTP: jest.fn(),
}));

// Mock do @/lib/auth com api.getSession mockável
const mockGetSession = jest.fn();

jest.mock('@/lib/auth', () => ({
    auth: {
        handler: jest.fn(),
        api: {
            getSession: mockGetSession,
        },
    },
}));

// Mock do fetch global (para TMDB e outras APIs externas)
global.fetch = jest.fn();

// Mock do next/headers
jest.mock('next/headers', () => ({
    headers: jest.fn(async () => new Headers()),
    cookies: jest.fn(),
}));
