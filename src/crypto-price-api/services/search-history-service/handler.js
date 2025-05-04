import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const tableName = process.env.TABLE_NAME;
if (!tableName) throw new Error("TABLE_NAME environment variable not set.");


/*
 * Flow:
 * 1. Initialize DynamoDB Document Client.
 * 2. Get DynamoDB table name from environment variables.
 * 3. Handler function receives the API Gateway event.
 * 4. Validate HTTP method (must be GET).
 * 5. Extract and validate the 'email' query string parameter.
 * 6. Fetch search history from DynamoDB using a Scan operation filtered by email.
 * 7. Handle pagination if the scan result exceeds the limit.
 * 8. Format and return a success response (200) with the history items.
 * 9. Catch any errors, log them, and return an appropriate error response (400, 405, or 500).
 */

export const handler = async (event) => {
    console.log('EVENT:', JSON.stringify(event, null, 2));
    const httpMethod = event.requestContext?.http?.method ?? event.httpMethod;

    try {
        if (httpMethod !== 'GET') {
            throw new Error(`Unsupported HTTP method: ${httpMethod}`);
        }

        const recipientEmail = event.queryStringParameters?.email;
        if (!recipientEmail) {
            throw new Error("Missing 'email' query string parameter");
        }
        if (typeof recipientEmail !== 'string' || !recipientEmail.includes('@')) {
            throw new Error("Invalid 'email' format in query string parameter");
        }

        console.log(`Fetching history for email: ${recipientEmail}`);
        const items = await fetchSearchHistoryByEmail(recipientEmail);
        return createResponse(200, items);

    } catch (err) {
        console.error("Request Error:", err);
        return createErrorResponse(err);
    }
};

const fetchSearchHistoryByEmail = async (email) => {
    const params = {
        TableName: tableName,
        FilterExpression: "recipientEmail = :emailVal",
        ExpressionAttributeValues: { ":emailVal": email },
    };
    let allItems = [];
    let data;
    try {
        do {
            data = await docClient.send(new ScanCommand(params));
            if (data.Items) allItems = allItems.concat(data.Items);
            params.ExclusiveStartKey = data.LastEvaluatedKey;
        } while (data.LastEvaluatedKey);
        console.log(`Scan found ${allItems.length} items for ${email}`);
        return allItems;
    } catch (dbError) {
        console.error(`DynamoDB Scan Error for ${email}: ${dbError}`);
        throw new Error(`Failed to retrieve search history: ${dbError.message}`);
    }
};

const createResponse = (statusCode, body) => ({
    statusCode,
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' }
});

const createErrorResponse = (err) => {
    let statusCode = 500;
    let error = "Internal Server Error";
    let details = err.message;

    if (details.includes("Unsupported HTTP method")) {
        statusCode = 405;
        error = details;
        details = `Only GET method is accepted.`;
    } else if (details.includes("Missing 'email'") || details.includes("Invalid 'email' format")) {
        statusCode = 400;
        error = "Bad Request";
    } else if (details.includes("Failed to retrieve search history")) {
        error = "Failed to retrieve search history.";
    }

    return createResponse(statusCode, { error, details });
};