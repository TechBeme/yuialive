/**
 * 📦 PAYLOAD TEST HELPERS
 * Helpers para validar payloads de resposta das APIs
 */

/**
 * Valida que o payload NÃO contém campos sensíveis
 */
export function expectNoSensitiveData(data: any, sensitiveFields: string[]) {
    sensitiveFields.forEach(field => {
        expect(data).not.toHaveProperty(field);
    });
}

/**
 * Valida que o payload contém APENAS os campos especificados
 */
export function expectOnlyFields(data: any, allowedFields: string[]) {
    const actualFields = Object.keys(data);
    const unexpectedFields = actualFields.filter(field => !allowedFields.includes(field));

    expect(unexpectedFields).toEqual([]);
    expect(actualFields.length).toBeGreaterThan(0);
}

/**
 * Valida que o payload contém EXATAMENTE os campos especificados (nem mais, nem menos)
 */
export function expectExactFields(data: any, requiredFields: string[]) {
    const actualFields = Object.keys(data).sort();
    const expectedFields = requiredFields.sort();

    expect(actualFields).toEqual(expectedFields);
}

/**
 * Valida que o payload NÃO contém campos específicos
 */
export function expectMissingFields(data: any, forbiddenFields: string[]) {
    forbiddenFields.forEach(field => {
        expect(data).not.toHaveProperty(field);
    });
}

/**
 * Valida que o payload contém todos os campos obrigatórios
 */
export function expectRequiredFields(data: any, requiredFields: string[]) {
    requiredFields.forEach(field => {
        expect(data).toHaveProperty(field);
    });
}

/**
 * Valida que um array de objetos NÃO contém campos sensíveis em nenhum item
 */
export function expectArrayNoSensitiveData(array: any[], sensitiveFields: string[]) {
    array.forEach(item => {
        expectNoSensitiveData(item, sensitiveFields);
    });
}

/**
 * Valida que um array de objetos contém APENAS os campos especificados em todos os itens
 */
export function expectArrayOnlyFields(array: any[], allowedFields: string[]) {
    array.forEach(item => {
        expectOnlyFields(item, allowedFields);
    });
}

/**
 * Valida que a resposta é 204 No Content (sem body)
 */
export async function expectEmptyBody(response: Response) {
    expect(response.status).toBe(204);
    const text = await response.text();
    expect(text).toBe('');
}

/**
 * Valida que o payload é um objeto JSON válido
 */
export async function expectValidJson(response: Response) {
    const contentType = response.headers.get('content-type');
    expect(contentType).toContain('application/json');

    const data = await response.json();
    expect(data).toBeDefined();
    return data;
}

/**
 * Valida que o payload contém estrutura de erro padrão
 */
export function expectErrorStructure(data: any) {
    expect(data).toHaveProperty('error');
    expect(typeof data.error).toBe('string');
    expect(data.error.length).toBeGreaterThan(0);
}

/**
 * Valida que objetos aninhados não contêm campos sensíveis
 */
export function expectNestedNoSensitiveData(
    data: any,
    path: string[],
    sensitiveFields: string[]
) {
    let current = data;

    for (const key of path) {
        if (current[key] === undefined) {
            throw new Error(`Path ${path.join('.')} not found in data`);
        }
        current = current[key];
    }

    if (Array.isArray(current)) {
        expectArrayNoSensitiveData(current, sensitiveFields);
    } else {
        expectNoSensitiveData(current, sensitiveFields);
    }
}

/**
 * Valida que rate limit headers estão presentes
 */
export function expectRateLimitHeaders(response: Response) {
    // Verifica se tem pelo menos um header de rate limit
    const hasRateLimitHeader =
        response.headers.has('x-ratelimit-limit') ||
        response.headers.has('x-ratelimit-remaining') ||
        response.headers.has('ratelimit-limit') ||
        response.headers.has('ratelimit-remaining');

    expect(hasRateLimitHeader).toBe(true);
}

/**
 * Valida tamanho máximo do payload (em bytes)
 */
export async function expectMaxPayloadSize(response: Response, maxBytes: number) {
    const text = await response.text();
    const size = new TextEncoder().encode(text).length;

    expect(size).toBeLessThanOrEqual(maxBytes);
}

/**
 * Valida que timestamps estão em formato ISO válido
 */
export function expectValidTimestamps(data: any, timestampFields: string[]) {
    timestampFields.forEach(field => {
        if (data[field]) {
            const date = new Date(data[field]);
            expect(date.toString()).not.toBe('Invalid Date');
        }
    });
}
