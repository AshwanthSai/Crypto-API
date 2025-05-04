import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import nodemailer from 'nodemailer';
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ssmClient = new SSMClient({});

const tableName = process.env.TABLE_NAME;
const mailtrapSsmParamName = process.env.MAILTRAP_SSM_PARAMETER_NAME;
const mailtrapUser = process.env.MAILTRAP_USER;
const fromEmail = process.env.FROM_EMAIL;
const coinGeckoApiKeySsmParamName = process.env.COINGECKO_API_KEY_SSM_PARAM_NAME;

if (!tableName) throw new Error("TABLE_NAME environment variable not set.");
if (!mailtrapSsmParamName) throw new Error("MAILTRAP_SSM_PARAMETER_NAME environment variable not set.");
if (!mailtrapUser) throw new Error("MAILTRAP_USER environment variable not set.");
if (!fromEmail) throw new Error("FROM_EMAIL environment variable not set.");
if (!coinGeckoApiKeySsmParamName) throw new Error("COINGECKO_API_KEY_SSM_PARAM_NAME environment variable not set.");

let mailtrapTokenCache;
let coinGeckoApiKeyCache;
let transporter;

/*
 * Flow:
 * 1. Initialize AWS SDK clients (DynamoDB, SSM).
 * 2. Load configuration from environment variables (Table Name, SSM Param Names, Email details).
 * 3. Define functions to fetch secrets (Mailtrap token, CoinGecko API key) from SSM with caching.
 * 4. Define function to lazily initialize Nodemailer transporter using fetched secrets.
 * 5. Main handler function:
 *    a. Parses the incoming API Gateway event.
 *    b. Validates HTTP method (must be POST).
 *    c. Parses and validates the request body (cryptoId, email).
 *    d. Calls the orchestrator function `recordSearchAndNotify`.
 *    e. Returns a formatted success or error response.
 * 6. Orchestrator function `recordSearchAndNotify`:
 *    a. Generates a unique search ID and timestamp.
 *    b. Fetches the crypto price using `fetchCryptoPrice`.
 *    c. Prepares the item data including fetch status and recipient email.
 *    d. Writes the item to DynamoDB using `writeSearchToDb`.
 *    e. Generates email content using `getEmailContent`.
 *    f. Sends the notification email using `sendNotificationEmail`.
 *    g. Handles and potentially re-throws errors from fetch or DB operations.
 *    h. Returns the recorded item data on success.
 * 7. Helper functions:
 *    a. `fetchCryptoPrice`: Calls CoinGecko API (using cached key) to get the price.
 *    b. `writeSearchToDb`: Puts the item into the DynamoDB table.
 *    c. `getEmailContent`: Formats the email subject, HTML, and text body.
 *    d. `sendNotificationEmail`: Sends the email using the initialized transporter.
 *    e. `createErrorResponse`: Creates standardized error responses for API Gateway.
 */

async function getMailtrapToken() {
    if (mailtrapTokenCache) {
        return mailtrapTokenCache;
    }
    console.log(`Fetching Mailtrap token from SSM parameter: ${mailtrapSsmParamName}`);
    try {
        const command = new GetParameterCommand({
            Name: mailtrapSsmParamName,
            WithDecryption: true
        });
        const response = await ssmClient.send(command);
        if (response.Parameter && response.Parameter.Value) {
            mailtrapTokenCache = response.Parameter.Value;
            console.log("Successfully fetched and cached Mailtrap token.");
            return mailtrapTokenCache;
        } else {
            throw new Error("Parameter value not found in SSM response for Mailtrap token.");
        }
    } catch (error) {
        console.error(`Error fetching Mailtrap token from SSM parameter ${mailtrapSsmParamName}:`, error);
        throw new Error(`Could not retrieve Mailtrap token from SSM: ${error.message}`);
    }
}

async function getCoinGeckoApiKey() {
    if (coinGeckoApiKeyCache) {
        return coinGeckoApiKeyCache;
    }
    console.log(`Fetching CoinGecko API key from SSM parameter: ${coinGeckoApiKeySsmParamName}`);
    try {
        const command = new GetParameterCommand({
            Name: coinGeckoApiKeySsmParamName,
            WithDecryption: true
        });
        const response = await ssmClient.send(command);
        if (response.Parameter && response.Parameter.Value) {
            coinGeckoApiKeyCache = response.Parameter.Value;
            console.log("Successfully fetched and cached CoinGecko API key.");
            return coinGeckoApiKeyCache;
        } else {
            throw new Error("Parameter value not found in SSM response for CoinGecko API key.");
        }
    } catch (error) {
        console.error(`Error fetching CoinGecko API key from SSM parameter ${coinGeckoApiKeySsmParamName}:`, error);
        throw new Error(`Could not retrieve CoinGecko API key from SSM: ${error.message}`);
    }
}

async function ensureTransporter() {
     if (!transporter) {
        const token = await getMailtrapToken();
        console.log("Initializing Nodemailer transporter...");
        transporter = nodemailer.createTransport({
            host: "live.smtp.mailtrap.io",
            port: 587,
            secure: false,
            auth: {
                user: mailtrapUser,
                pass: token
            }
        });
        console.log("Nodemailer transporter initialized.");
     }
}

export const handler = async (event) => {
    console.log('RAW EVENT RECEIVED:', JSON.stringify(event, null, 2));
    const actualHttpMethod = event.httpMethod ?? event.requestContext?.http?.method;
    console.log(`Processing ${actualHttpMethod} request`);
    let body;
    let statusCode = 200;
    let requestData = {};

    try {
        if (actualHttpMethod !== 'POST') {
            throw new Error(`Unsupported HTTP method: ${actualHttpMethod}`);
        }

        if (!event.body) {
            throw new Error("Missing request body for POST");
        }
        try {
            const requestBody = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf-8') : event.body;
            const parsedBody = JSON.parse(requestBody);
            requestData.cryptoId = parsedBody.cryptoId;
            requestData.recipientEmail = parsedBody.email;
            console.log(`POST request body parsed: cryptoId=${requestData.cryptoId}, recipientEmail=${requestData.recipientEmail}`);

            if (!requestData.cryptoId) {
                throw new Error("Missing 'cryptoId' in request body");
            }
            if (!requestData.recipientEmail) {
                throw new Error("Missing 'email' in request body");
            }
            if (typeof requestData.recipientEmail !== 'string' || !requestData.recipientEmail.includes('@')) {
                throw new Error("Invalid 'email' format in request body");
            }

        } catch (parseError) {
            console.error("Failed to parse request body:", parseError);
            if (parseError instanceof SyntaxError) {
                 throw new Error(`Invalid JSON format in request body: ${parseError.message}`);
            }
            throw parseError;
        }

        body = await recordSearchAndNotify(requestData.cryptoId, requestData.recipientEmail);

        return {
            statusCode,
            body: JSON.stringify(body),
            headers: { 'Content-Type': 'application/json' }
        };

    } catch (err) {
        return createErrorResponse(err, actualHttpMethod);
    }
};

const createErrorResponse = (err) => {
    console.error("Request Processing Error:", err);
    let statusCode = 500;
    let errorMessage = "An internal server error occurred.";
    let errorDetails = err.message;

    if (err.message.includes("Unsupported HTTP method")) {
        statusCode = 405;
        errorMessage = err.message;
        errorDetails = `Only POST method is accepted.`;
    } else if (err.message.includes("Missing") || err.message.includes("Invalid JSON") || err.message.includes("Invalid 'email' format")) {
        statusCode = 400;
        errorMessage = "Bad Request";
    } else if (err.message.includes("Failed to fetch price") || err.message.includes("Price data not found")) {
         statusCode = 502;
         errorMessage = "Failed to retrieve cryptocurrency data.";
    } else if (err.message.includes("Failed to store search history")) {
         statusCode = 500;
         errorMessage = "Failed to record search.";
    } else if (err.message.includes("Could not retrieve Mailtrap token") || err.message.includes("Could not retrieve CoinGecko API key")) {
         statusCode = 500;
         errorMessage = "Internal configuration error.";
    }

    return {
        statusCode,
        body: JSON.stringify({ error: errorMessage, details: errorDetails }),
        headers: { 'Content-Type': 'application/json' }
    };
};

const fetchCryptoPrice = async (cryptoId, currency = 'usd') => {
    const lookupId = cryptoId.toLowerCase();
    console.log(`Fetching price for ${cryptoId} (lookup: ${lookupId}) in ${currency} from CoinGecko...`);
    const url = `https://api.coingecko.com/api/v3/simple/price`;
    const params = { ids: lookupId, vs_currencies: currency };
    const apiKey = await getCoinGeckoApiKey();

    const options = {
        method: 'GET',
        headers: {
            'accept': 'application/json',
            'x-cg-demo-api-key': apiKey
        },
        params: params
    };

    try {
        const response = await axios.get(url, options);
        console.log("CoinGecko Raw Response Data:", JSON.stringify(response.data));
        const price = response.data?.[lookupId]?.[currency];

        if (price !== undefined && price !== null) {
            console.log(`Successfully fetched price for ${cryptoId}: ${price} ${currency}`);
            return price;
        } else {
            console.warn(`Price data not found for ${cryptoId} in ${currency} within CoinGecko response (lookup key: ${lookupId}).`);
            throw new Error(`Price data not found for ${cryptoId} in ${currency}.`);
        }
    } catch (error) {
        console.error(`CoinGecko API Error fetching price for ${cryptoId}:`, error.message);
        if (error.response) {
            console.error('Error Status:', error.response.status);
            console.error('Error Data:', JSON.stringify(error.response.data));
        }
        throw new Error(`Failed to fetch price from CoinGecko: ${error.message}`);
    }
};

const writeSearchToDb = async (item) => {
    console.log(`Storing search ${item.searchId} to DynamoDB...`);
    try {
        await docClient.send(new PutCommand({ TableName: tableName, Item: item }));
        console.log(`Stored search ${item.searchId} successfully.`);
    } catch (dbError) {
        console.error(`DB Put Error for ${item.searchId}: ${dbError}`);
        throw new Error(`Failed to store search history: ${dbError.message}`);
    }
};

const getEmailContent = (item) => {
    const aestTimeOptions = { timeZone: 'Australia/Sydney', dateStyle: 'medium', timeStyle: 'long' };
    const displayTimestamp = new Date(item.timestamp).toLocaleString('en-AU', aestTimeOptions);
    console.log(`Generating email content for search ${item.searchId}...`);
    const priceDisplay = item.queriedPrice !== null
        ? `${item.queriedPrice} ${item.queriedCurrency.toUpperCase()}`
        : `Could not be fetched (${item.fetchStatus})`;

    const subject = `Crypto Price Search: ${item.cryptocurrencyId}`;
    const html = `
        <h1>Cryptocurrency Price Information</h1>
        <p>You requested the price for:</p>
        <ul>
            <li>Cryptocurrency: <strong>${item.cryptocurrencyId}</strong></li>
            <li>Current Price: <strong>${priceDisplay}</strong></li>
            <li>Timestamp: ${displayTimestamp}</li>
            <li>Search ID: ${item.searchId}</li>
            <li>Fetch Status: ${item.fetchStatus}</li>
        </ul>
    `;
    const text = `Cryptocurrency Price Information:\nCryptocurrency: ${item.cryptocurrencyId}\nCurrent Price: ${priceDisplay}\nTimestamp: ${new Date(item.timestamp).toISOString()}\nSearch ID: ${item.searchId}\nFetch Status: ${item.fetchStatus}`;

    return { subject, html, text };
};

const sendNotificationEmail = async (searchId, emailContent, recipientEmail) => {
    if (!recipientEmail || typeof recipientEmail !== 'string' || !recipientEmail.includes('@')) {
         console.error(`Invalid or missing recipient email address provided for search ${searchId}: ${recipientEmail}`);
         return;
    }

    await ensureTransporter();
    console.log(`Attempting to send email notification for search ${searchId} to ${recipientEmail}...`);

    const mailOptions = {
        from: fromEmail,
        to: recipientEmail,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text
    };

    try {
        console.log("Attempting Send");
        const info = await transporter.sendMail(mailOptions);
        console.log(`Email sent successfully for ${searchId} to ${recipientEmail}. Message ID: ${info.messageId}`);
        return info;
    } catch (emailError) {
        console.error(`Email Sending Error for search ${searchId} to ${recipientEmail}:`, emailError);
    }
};

const recordSearchAndNotify = async (cryptoId, recipientEmail) => {
    const searchId = uuidv4();
    const timestamp = Date.now();
    console.log(`Orchestrating search for ${cryptoId}, ID: ${searchId}, Recipient: ${recipientEmail}`);

    let price = null;
    let fetchStatus = 'Pending';
    let fetchError = null;
    const currency = 'usd';

    try {
        price = await fetchCryptoPrice(cryptoId, currency);
        fetchStatus = 'Success';
    } catch (error) {
        console.error(`Failed to fetch price during orchestration for ${cryptoId}: ${error.message}`);
        fetchError = error;
        fetchStatus = `Failed: ${error.message}`;
    }

    const item = {
        searchId,
        timestamp,
        cryptocurrencyId: cryptoId,
        queriedPrice: price !== null ? price.toString() : null,
        queriedCurrency: currency,
        fetchStatus,
        recipientEmail: recipientEmail
    };

    try {
        await writeSearchToDb(item);
    } catch (dbError) {
        throw dbError;
    }

    try {
        const emailContent = getEmailContent(item);
        await sendNotificationEmail(searchId, emailContent, recipientEmail);
    } catch (emailError) {
        console.error(`Email process failed for ${searchId}, but DB write was successful. Error: ${emailError.message}`);
    }

    if (fetchError) {
       throw fetchError;
    }

    return item;
};