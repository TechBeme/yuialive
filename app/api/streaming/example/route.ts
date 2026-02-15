import { NextRequest, NextResponse } from 'next/server';
import { STREAMING_API_TOKEN } from '@/lib/config';

/**
 * Example streaming backend implementation.
 * 
 * This reference implementation shows how your external backend should work.
 * In production, replace this with your own backend that:
 * - Generates signed URLs (S3/CloudFront/R2)
 * - Queries video database
 * - Integrates with your CDN
 * 
 * This route is used automatically in development when STREAMING_API_URL is not configured.
 * 
 * @see /docs/STREAMING_API_IMPLEMENTATION.md for complete implementation guide
 */

interface StreamingRequest {
    tmdbId: number;
    mediaType: 'movie' | 'tv';
    userId: string;
    userEmail: string;
    userName: string | null;
    userPlan: string;
    maxScreens: number;
    season?: number;
    episode?: number;
}

export async function POST(request: NextRequest) {
    try {
        const body: StreamingRequest = await request.json();
        const authHeader = request.headers.get('Authorization');
        const expectedToken = STREAMING_API_TOKEN;

        if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
            return NextResponse.json(
                { error: 'api.validation.invalidToken' },
                { status: 401 }
            );
        }

        if (!body.tmdbId || !body.mediaType) {
            return NextResponse.json(
                { error: 'api.validation.missingParams' },
                { status: 400 }
            );
        }

        // Production implementation examples:
        // 
        // Option A: S3 + CloudFront (AWS)
        // const s3Key = `videos/${body.tmdbId}.mp4`;
        // const signedUrl = await s3.getSignedUrl(s3Key, { expiresIn: 3600 });
        // return NextResponse.json({ url: signedUrl });
        //
        // Option B: Database lookup
        // const video = await db.videos.findOne({ tmdbId: body.tmdbId });
        // return NextResponse.json({ url: video.url });
        //
        // Option C: CDN
        // const cdnUrl = `https://cdn.example.com/videos/${body.tmdbId}.mp4`;
        // return NextResponse.json({ url: cdnUrl });
        //
        // Option D: Cloudflare R2 + Workers
        // const r2Key = `content/${body.tmdbId}.mp4`;
        // const signedUrl = await generateR2SignedUrl(r2Key);
        // return NextResponse.json({ url: signedUrl });

        // For this example: return test videos from public URLs
        const testVideos: Record<string, string> = {
            // Fight Club (ID: 550)
            '550': 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',

            // The Matrix (ID: 603)
            '603': 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',

            // Inception (ID: 27205)
            '27205': 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',

            // Breaking Bad (ID: 1396)
            '1396': 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',

            // Game of Thrones (ID: 1399)
            '1399': 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
        };

        // Pegar vídeo específico ou usar Big Buck Bunny como padrão
        const baseVideoUrl = testVideos[body.tmdbId.toString()] || testVideos['550'];

        // 6. Retornar apenas 1080p (resolução real dos vídeos de exemplo)
        // Na produção, você retornaria as qualidades disponíveis para cada vídeo
        const qualities = [
            { label: '1080p', url: baseVideoUrl, bitrate: 5000 },
        ];

        // Qualidade padrão é 1080p (única disponível)
        const defaultQuality = '1080p';

        // Legendas de exemplo (VTT local - sem problemas de CORS)
        // Na produção, você hospedaria as legendas no seu próprio servidor/CDN
        const subtitles = [
            {
                label: 'Português (BR)',
                language: 'pt-BR',
                src: '/subtitles/pt-BR.vtt',
            },
            {
                label: 'English',
                language: 'en',
                src: '/subtitles/en.vtt',
            },
            {
                label: 'Español',
                language: 'es',
                src: '/subtitles/es.vtt',
            },
        ];

        // Faixas de áudio disponíveis (na produção, seria gerenciado pelo HLS manifest)
        // ATENÇÃO: Só envie audioTracks se realmente houver múltiplas faixas no vídeo
        // Para vídeos simples (MP4), NÃO envie este campo (o video player ocultará a seção)
        // Exemplo com múltiplas faixas:
        // const audioTracks = [
        //     { label: 'Português (BR)', language: 'pt-BR' },
        //     { label: 'English', language: 'en' },
        //     { label: 'Español', language: 'es' },
        // ];
        // ============================================
        // MONTANDO A RESPOSTA
        // ============================================
        // 
        // REGRAS IMPORTANTES:
        // 1. "url" (obrigatório): URL principal do vídeo
        // 2. "qualities" (opcional): Array com múltiplas qualidades disponíveis
        //    - Neste exemplo: apenas 1080p (resolução real dos vídeos)
        //    - Em produção: retorne apenas as qualidades que realmente existem
        // 3. "defaultQuality" (opcional): Qualidade recomendada baseada no plano
        // 4. "subtitles" (opcional): Array de legendas (.vtt)
        // 5. "audioTracks" (opcional): SOMENTE se houver 2+ faixas de áudio
        //    ❌ NÃO envie para vídeos MP4 simples
        //    ✅ Envie para HLS/DASH com múltiplas faixas
        //
        const response = {
            url: baseVideoUrl, // URL padrão
            qualities, // Array com apenas 1080p
            defaultQuality, // 1080p
            subtitles, // Array de legendas
            // audioTracks, // NÃO ENVIAR para vídeos simples (comentado propositalmente)
            expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
        };

        return NextResponse.json(response);

    } catch (error: any) {
        console.error('❌ [EXAMPLE] Error resolving video:', error);

        return NextResponse.json(
            {
                error: error.message || 'api.errors.internalError'
            },
            { status: 500 }
        );
    }
}

export async function GET() {
    return NextResponse.json({
        name: 'Example Streaming Backend',
        version: '1.0.0',
        description: 'Reference implementation showing how to create your streaming backend',
        endpoints: {
            resolve: {
                method: 'POST',
                path: '/api/streaming/example',
                body: {
                    tmdbId: 'number (required)',
                    mediaType: '"movie" | "tv" (required)',
                    userId: 'string (required)',
                    userPlan: 'string (required)',
                    season: 'number (optional, for TV shows)',
                    episode: 'number (optional, for TV shows)',
                },
                response: {
                    url: 'string (required)',
                    quality: 'string (optional)',
                    expiresAt: 'string (optional)',
                    subtitles: 'array (optional)',
                },
            },
        },
        documentation: '/docs/STREAMING_API_IMPLEMENTATION.md',
    });
}
