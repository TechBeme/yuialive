#!/bin/bash

# 🧪 Script de Execução de Testes de APIs
# Execute todos os testes de validação das 26 APIs

set -e

echo "🧪 =================================="
echo "   TESTES DE APIs - YuiALive"
echo "   Total: 26 APIs | Cobertura: 100%"
echo "===================================="
echo ""

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Função para executar grupo de testes
run_test_group() {
    local name=$1
    local file=$2
    local emoji=$3
    
    echo -e "${BLUE}${emoji} Executando: ${name}${NC}"
    
    if npm run test -- --testPathPatterns="${file}" --silent; then
        echo -e "${GREEN}✅ ${name} - PASSOU${NC}"
        echo ""
        return 0
    else
        echo -e "${RED}❌ ${name} - FALHOU${NC}"
        echo ""
        return 1
    fi
}

# Contador de resultados
passed=0
failed=0

# ========================================
# GRUPO 1: Watchlist (4 endpoints)
# ========================================
echo -e "${YELLOW}📦 GRUPO 1: Watchlist APIs (4 endpoints)${NC}"
if run_test_group "Watchlist APIs" "__tests__/api/watchlist.api.test.ts" "🎬"; then
    ((passed++))
else
    ((failed++))
fi

# ========================================
# GRUPO 2: Watch History (3 endpoints)
# ========================================
echo -e "${YELLOW}📺 GRUPO 2: Watch History APIs (3 endpoints)${NC}"
if run_test_group "Watch History APIs" "__tests__/api/watch-history.api.test.ts" "📺"; then
    ((passed++))
else
    ((failed++))
fi

# ========================================
# GRUPO 3: Family (5 endpoints)
# ========================================
echo -e "${YELLOW}👨‍👩‍👧‍👦 GRUPO 3: Family APIs (5 endpoints)${NC}"
if run_test_group "Family APIs" "__tests__/api/family.api.test.ts" "👨‍👩‍👧‍👦"; then
    ((passed++))
else
    ((failed++))
fi

# ========================================
# GRUPO 4: Settings (8 endpoints)
# ========================================
echo -e "${YELLOW}⚙️ GRUPO 4: Settings APIs (8 endpoints)${NC}"
if run_test_group "Settings APIs" "__tests__/api/settings.api.test.ts" "⚙️"; then
    ((passed++))
else
    ((failed++))
fi

# ========================================
# GRUPO 5: Public APIs (6 endpoints)
# ========================================
echo -e "${YELLOW}🌐 GRUPO 5: Public APIs (6 endpoints)${NC}"
if run_test_group "Public APIs" "__tests__/api/public.api.test.ts" "🌐"; then
    ((passed++))
else
    ((failed++))
fi

# ========================================
# GRUPO 6: Internal APIs (7 endpoints)
# ========================================
echo -e "${YELLOW}🔐 GRUPO 6: Internal APIs (7 endpoints)${NC}"
if run_test_group "Internal APIs" "__tests__/api/internal.api.test.ts" "🔐"; then
    ((passed++))
else
    ((failed++))
fi

# ========================================
# RESUMO FINAL
# ========================================
echo ""
echo "===================================="
echo "   📊 RESUMO DOS TESTES"
echo "===================================="
echo ""

total=$((passed + failed))

if [ $failed -eq 0 ]; then
    echo -e "${GREEN}✅ TODOS OS TESTES PASSARAM!${NC}"
    echo ""
    echo "   📦 Watchlist: ✅"
    echo "   📺 Watch History: ✅"
    echo "   👨‍👩‍👧‍👦 Family: ✅"
    echo "   ⚙️ Settings: ✅"
    echo "   🌐 Public: ✅"
    echo "   🔐 Internal: ✅"
    echo ""
    echo -e "${GREEN}🎉 26/26 APIs validadas com sucesso!${NC}"
    echo ""
    exit 0
else
    echo -e "${RED}❌ ALGUNS TESTES FALHARAM${NC}"
    echo ""
    echo "   Passaram: ${passed}/${total}"
    echo "   Falharam: ${failed}/${total}"
    echo ""
    echo -e "${YELLOW}📋 Execute 'npm test' para ver detalhes${NC}"
    echo ""
    exit 1
fi
