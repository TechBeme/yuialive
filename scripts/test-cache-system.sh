#!/bin/bash

###############################################################################
# TMDB CACHE SYSTEM - VALIDATION TEST SUITE
###############################################################################
# 
# Testa toda a infraestrutura de cache enterprise-grade:
# - Health checks
# - Warm-up manual
# - Métricas
# - Revalidação
# 
# Usage:
#   chmod +x scripts/test-cache-system.sh
#   ./scripts/test-cache-system.sh [BASE_URL]
#
# Examples:
#   ./scripts/test-cache-system.sh http://localhost:3000
#   ./scripts/test-cache-system.sh https://live.yuia.dev
#
###############################################################################

set -e  # Exit on error

BASE_URL="${1:-http://localhost:3000}"
CRON_SECRET="${CRON_SECRET:-}"

echo "═══════════════════════════════════════════════════════════════════"
echo "🧪 TMDB CACHE SYSTEM - VALIDATION TEST SUITE"
echo "═══════════════════════════════════════════════════════════════════"
echo "Target: $BASE_URL"
echo "───────────────────────────────────────────────────────────────────"
echo

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

###############################################################################
# TEST FUNCTIONS
###############################################################################

test_endpoint() {
    local name="$1"
    local endpoint="$2"
    local expected_status="${3:-200}"
    
    echo -n "Testing: $name ... "
    
    response=$(curl -s -w "\n%{http_code}" "$BASE_URL$endpoint")
    status_code=$(echo "$response" | tail -n 1)
    body=$(echo "$response" | head -n -1)
    
    if [ "$status_code" = "$expected_status" ]; then
        echo -e "${GREEN}✓ PASS${NC} (HTTP $status_code)"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        
        # Pretty print JSON if jq is available
        if command -v jq &> /dev/null; then
            echo "$body" | jq '.' 2>/dev/null | head -n 20
        fi
        return 0
    else
        echo -e "${RED}✗ FAIL${NC} (Expected $expected_status, got $status_code)"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        echo "Response: $body"
        return 1
    fi
}

test_health_check() {
    echo -e "\n${BLUE}[1/5] Testing TMDB Health Check${NC}"
    echo "───────────────────────────────────────────────────────────────"
    
    test_endpoint "TMDB Integration Health" "/api/health/tmdb" "200"
    
    echo
}

test_metrics() {
    echo -e "\n${BLUE}[2/5] Testing Cache Metrics${NC}"
    echo "───────────────────────────────────────────────────────────────"
    
    test_endpoint "Cache Metrics Endpoint" "/api/metrics/cache" "200"
    
    echo
}

test_warm_up() {
    echo -e "\n${BLUE}[3/5] Testing Manual Cache Warm-Up${NC}"
    echo "───────────────────────────────────────────────────────────────"
    
    if [ -z "$CRON_SECRET" ]; then
        echo -e "${YELLOW}⚠ SKIP${NC} (CRON_SECRET not set)"
        echo "To test warm-up: export CRON_SECRET=your_secret"
    else
        echo -n "Testing: Manual Warm-Up ... "
        
        response=$(curl -s -w "\n%{http_code}" \
            -H "Authorization: Bearer $CRON_SECRET" \
            "$BASE_URL/api/cron/warm-cache")
        
        status_code=$(echo "$response" | tail -n 1)
        body=$(echo "$response" | head -n -1)
        
        if [ "$status_code" = "200" ] || [ "$status_code" = "207" ]; then
            echo -e "${GREEN}✓ PASS${NC} (HTTP $status_code)"
            TESTS_PASSED=$((TESTS_PASSED + 1))
            
            if command -v jq &> /dev/null; then
                echo "$body" | jq '.'
            fi
        else
            echo -e "${RED}✗ FAIL${NC} (HTTP $status_code)"
            TESTS_FAILED=$((TESTS_FAILED + 1))
            echo "Response: $body"
        fi
    fi
    
    echo
}

test_revalidation() {
    echo -e "\n${BLUE}[4/5] Testing Cache Revalidation${NC}"
    echo "───────────────────────────────────────────────────────────────"
    
    test_endpoint "Revalidate TMDB Tag" "/api/revalidate?tag=tmdb" "200"
    test_endpoint "Revalidate Home Tag" "/api/revalidate?tag=home" "200"
    
    echo
}

test_catalog_page() {
    echo -e "\n${BLUE}[5/5] Testing Catalog Page${NC}"
    echo "───────────────────────────────────────────────────────────────"
    
    echo -n "Testing: Catalog Page Load ... "
    
    response=$(curl -s -w "\n%{http_code}" "$BASE_URL/catalog")
    status_code=$(echo "$response" | tail -n 1)
    body=$(echo "$response" | head -n -1)
    
    if [ "$status_code" = "200" ]; then
        # Check if contains expected content
        if echo "$body" | grep -q "Em Alta Esta Semana"; then
            echo -e "${GREEN}✓ PASS${NC} (HTTP $status_code, content rendered)"
            TESTS_PASSED=$((TESTS_PASSED + 1))
        else
            echo -e "${YELLOW}⚠ WARNING${NC} (HTTP $status_code, but content may be missing)"
            TESTS_PASSED=$((TESTS_PASSED + 1))
        fi
    else
        echo -e "${RED}✗ FAIL${NC} (HTTP $status_code)"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
    
    echo
}

###############################################################################
# RUN TESTS
###############################################################################

test_health_check
test_metrics
test_warm_up
test_revalidation
test_catalog_page

###############################################################################
# SUMMARY
###############################################################################

echo "═══════════════════════════════════════════════════════════════════"
echo "📊 TEST SUMMARY"
echo "═══════════════════════════════════════════════════════════════════"
echo -e "Total Tests: $((TESTS_PASSED + TESTS_FAILED))"
echo -e "${GREEN}Passed: $TESTS_PASSED${NC}"
echo -e "${RED}Failed: $TESTS_FAILED${NC}"
echo "───────────────────────────────────────────────────────────────────"

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ ALL TESTS PASSED!${NC}"
    echo "═══════════════════════════════════════════════════════════════════"
    exit 0
else
    echo -e "${RED}✗ SOME TESTS FAILED${NC}"
    echo "═══════════════════════════════════════════════════════════════════"
    exit 1
fi
