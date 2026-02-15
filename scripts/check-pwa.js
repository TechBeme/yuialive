#!/usr/bin/env node

/**
 * PWA Health Check Script
 * 
 * Verifica se todos os recursos necessários para PWA estão presentes e configurados corretamente.
 * 
 * Usage: node scripts/check-pwa.js
 */

const fs = require('fs');
const path = require('path');

const COLORS = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
};

const { green, red, yellow, blue, cyan, reset } = COLORS;

let hasErrors = false;
let hasWarnings = false;

function log(message, color = reset) {
    console.log(`${color}${message}${reset}`);
}

function success(message) {
    log(`✅ ${message}`, green);
}

function error(message) {
    log(`❌ ${message}`, red);
    hasErrors = true;
}

function warning(message) {
    log(`⚠️  ${message}`, yellow);
    hasWarnings = true;
}

function info(message) {
    log(`ℹ️  ${message}`, cyan);
}

function section(message) {
    log(`\n${'='.repeat(60)}`, blue);
    log(message, blue);
    log('='.repeat(60), blue);
}

// Check if file exists
function checkFile(filePath, description) {
    const fullPath = path.join(process.cwd(), filePath);
    if (fs.existsSync(fullPath)) {
        success(`${description}: ${filePath}`);
        return true;
    } else {
        error(`${description} não encontrado: ${filePath}`);
        return false;
    }
}

// Check file size
function checkFileSize(filePath, minSize, maxSize) {
    const fullPath = path.join(process.cwd(), filePath);
    if (!fs.existsSync(fullPath)) return false;

    const stats = fs.statSync(fullPath);
    const sizeKB = (stats.size / 1024).toFixed(2);

    if (stats.size < minSize) {
        warning(`${filePath} muito pequeno: ${sizeKB}KB (mínimo: ${(minSize / 1024).toFixed(0)}KB)`);
        return false;
    }
    if (maxSize && stats.size > maxSize) {
        warning(`${filePath} muito grande: ${sizeKB}KB (máximo: ${(maxSize / 1024).toFixed(0)}KB)`);
        return false;
    }

    info(`${filePath}: ${sizeKB}KB`);
    return true;
}

// Check image dimensions (requires sharp or similar, skipping for now)
function checkImageDimensions(filePath, expectedSize) {
    // Simplified check - just verify file exists and has reasonable size
    info(`${filePath}: esperado ${expectedSize}`);
    return checkFileSize(filePath, 1024, 500 * 1024); // 1KB - 500KB
}

// Main checks
function runChecks() {
    log('\n🔍 Verificando PWA - YUIALIVE\n', cyan);

    // Section 1: Service Worker
    section('1. Service Worker');
    checkFile('public/sw.js', 'Service Worker');
    if (checkFile('hooks/useServiceWorker.ts', 'Hook de registro')) {
        const hookContent = fs.readFileSync(
            path.join(process.cwd(), 'hooks/useServiceWorker.ts'),
            'utf8'
        );
        if (hookContent.includes("'/sw.js'")) {
            success('Service Worker path correto');
        } else {
            error('Service Worker path incorreto no hook');
        }
    }

    // Section 2: Manifest
    section('2. Web App Manifest');
    checkFile('app/manifest.ts', 'Manifest (Next.js)');

    // Check manifest content
    if (fs.existsSync('app/manifest.ts')) {
        const manifestContent = fs.readFileSync('app/manifest.ts', 'utf8');

        const requiredFields = [
            { field: 'id:', name: 'ID único' },
            { field: 'name:', name: 'Name' },
            { field: 'short_name:', name: 'Short name' },
            { field: 'description:', name: 'Description' },
            { field: 'start_url:', name: 'Start URL' },
            { field: 'display:', name: 'Display mode' },
            { field: 'theme_color:', name: 'Theme color' },
            { field: 'background_color:', name: 'Background color' },
            { field: 'icons:', name: 'Icons' },
        ];

        requiredFields.forEach(({ field, name }) => {
            if (manifestContent.includes(field)) {
                success(name);
            } else {
                error(`${name} ausente no manifest`);
            }
        });

        const recommendedFields = [
            { field: 'screenshots:', name: 'Screenshots' },
            { field: 'shortcuts:', name: 'Shortcuts' },
            { field: 'share_target:', name: 'Share target' },
            { field: 'display_override:', name: 'Display override' },
            { field: 'launch_handler:', name: 'Launch handler' },
        ];

        recommendedFields.forEach(({ field, name }) => {
            if (manifestContent.includes(field)) {
                success(`${name} (feature)`);
            } else {
                info(`${name} não implementado (opcional)`);
            }
        });
    }

    // Section 3: Icons
    section('3. Ícones');
    const icons = [
        { path: 'public/favicon.ico', desc: 'Favicon ICO', size: null },
        { path: 'public/favicon.svg', desc: 'Favicon SVG', size: null },
        { path: 'public/favicon-96x96.png', desc: 'Favicon 96x96', size: '96x96' },
        { path: 'public/favicon-192x192.png', desc: 'Favicon 192x192', size: '192x192' },
        { path: 'public/favicon-512x512.png', desc: 'Favicon 512x512', size: '512x512' },
        { path: 'public/android-icon.png', desc: 'Android Icon (maskable)', size: '500x500' },
    ];

    icons.forEach(({ path: iconPath, desc, size }) => {
        if (checkFile(iconPath, desc)) {
            if (size) {
                checkImageDimensions(iconPath, size);
            }
        }
    });

    // Section 4: Screenshots
    section('4. Screenshots');

    // Check if real screenshots exist
    const desktopScreenshots = [
        'public/screenshots/desktop/home.png',
        'public/screenshots/desktop/browse-movies.png',
        'public/screenshots/desktop/browse-tv.png',
        'public/screenshots/desktop/search.png',
    ];

    const mobileScreenshots = [
        'public/screenshots/mobile/home.png',
        'public/screenshots/mobile/browse-movies.png',
        'public/screenshots/mobile/browse-tv.png',
        'public/screenshots/mobile/search.png',
    ];

    let hasRealScreenshots = true;

    desktopScreenshots.forEach(screenshot => {
        if (checkFile(screenshot, 'Screenshot Desktop')) {
            checkFileSize(screenshot, 1024, 2 * 1024 * 1024); // 1KB - 2MB
        } else {
            hasRealScreenshots = false;
        }
    });

    mobileScreenshots.forEach(screenshot => {
        if (checkFile(screenshot, 'Screenshot Mobile')) {
            checkFileSize(screenshot, 1024, 2 * 1024 * 1024); // 1KB - 2MB
        } else {
            hasRealScreenshots = false;
        }
    });

    if (!hasRealScreenshots) {
        warning('Screenshots reais não encontrados. Execute: npm run pwa:screenshots');
    } else {
        success('Screenshots reais da aplicação encontrados!');
    }
    section('5. Offline Support');
    checkFile('app/offline/page.tsx', 'Página Offline');

    // Section 6: PWA Components
    section('6. Componentes PWA');
    checkFile('components/PWAProvider.tsx', 'PWA Provider');
    checkFile('components/PWAInstallPrompt.tsx', 'Install Prompt');
    checkFile('components/PWAUpdateNotification.tsx', 'Update Notification');

    // Check if PWAProvider is used in layout
    if (checkFile('app/layout.tsx', 'Layout')) {
        const layoutContent = fs.readFileSync('app/layout.tsx', 'utf8');
        if (layoutContent.includes('<PWAProvider')) {
            success('PWAProvider incluído no layout');
        } else {
            error('PWAProvider não encontrado no layout');
        }
    }

    // Section 7: Configuration
    section('7. Configuração Next.js');
    if (checkFile('next.config.ts', 'Next.js Config')) {
        const configContent = fs.readFileSync('next.config.ts', 'utf8');

        if (configContent.includes('/sw.js') && configContent.includes('no-cache')) {
            success('Headers do Service Worker configurados');
        } else {
            warning('Headers do Service Worker podem não estar configurados');
        }

        if (configContent.includes('/manifest.webmanifest')) {
            success('Headers do Manifest configurados');
        } else {
            warning('Headers do Manifest podem não estar configurados');
        }
    }

    // Final summary
    section('📊 Resumo');

    if (hasErrors) {
        log('\n❌ Alguns problemas críticos foram encontrados. Corrija-os antes do deploy.', red);
        process.exit(1);
    } else if (hasWarnings) {
        log('\n⚠️  PWA configurada com alguns avisos. Funcional, mas pode ser melhorada.', yellow);
    } else {
        log('\n✅ PWA totalmente configurada! Tudo OK.', green);
    }

    log('\n📚 Próximos passos:', cyan);
    log('   1. Deploy para produção', reset);
    log('   2. Testar em https://live.yuia.dev/', reset);
    log('   3. Validar com PWABuilder: https://www.pwabuilder.com/', reset);
    log('   4. Instalar PWA em diferentes dispositivos', reset);
    log('   5. Monitorar analytics de instalação\n', reset);
}

// Run
runChecks();
