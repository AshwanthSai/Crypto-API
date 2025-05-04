import { handler } from './handler';

// Dummy test stub to check basic CI/CD pipeline functionality.
describe('Email Price Service Test', () => {

    test('should return 405 for GET request', async () => {
        const event = {
            requestContext: { http: { method: 'GET' } }
        };

        const result = await handler(event);

        expect(result.statusCode).toBe(405);
    });

});