import { describe, it, expect } from '@jest/globals';

describe('Authentication Flow (OTP)', () => {
    it('should send OTP to email for sign-in', async () => {
        const response = await fetch('http://localhost:3000/api/auth/email-otp/send-verification-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: 'test@example.com',
                type: 'sign-in',
            }),
        });

        // Should always return 200 (generic response, doesn't reveal if email exists)
        expect(response.status).toBe(200);
    });

    it('should reject invalid OTP', async () => {
        const response = await fetch('http://localhost:3000/api/auth/sign-in/email-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: 'test@example.com',
                otp: '000000',
            }),
        });

        // Should reject invalid OTP
        expect([400, 401, 422]).toContain(response.status);
    });
});

describe('TMDB Integration', () => {
    it('should fetch popular movies', async () => {
        const { tmdbService } = await import('../lib/tmdb');
        const movies = await tmdbService.getPopularMovies();

        expect(movies.results).toBeDefined();
        expect(movies.results.length).toBeGreaterThan(0);
    });

    it('should search for content', async () => {
        const { tmdbService } = await import('../lib/tmdb');
        const results = await tmdbService.search('Avengers', 'movie');

        expect(results.results).toBeDefined();
        expect(results.results.length).toBeGreaterThan(0);
    });
});

export { };
