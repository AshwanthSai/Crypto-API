# 🪙 Crypto Price API

[![Build Status](https://img.shields.io/github/actions/workflow/status/AshwanthSai/Crypto-API/deploy.yml?branch=main&style=for-the-badge)](https://github.com/<your-github-username>/<your-repo-name>/actions)
[![Node.js](https://img.shields.io/badge/Node.js-20.x-339933?style=for-the-badge&logo=node.js)](https://nodejs.org/)
[![AWS SAM](https://img.shields.io/badge/AWS-SAM-FF9900?style=for-the-badge&logo=aws-lambda)](https://aws.amazon.com/serverless/sam/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

A serverless API to fetch crypto prices, send email notifications, and track search history. Built with AWS SAM, Lambda, API Gateway, DynamoDB, and SSM.

---

## Table of Contents


*   [✨ Features](#-features)
*   [🔌 API Testing & Examples](#-api-testing--examples)
*   [🏗️ Architecture & Design](#️-architecture--design)
*   [🏛️ Architecture Diagram](#️-architecture-diagram)
*   [🚀 CI/CD Pipeline](#-cicd-pipeline)
*   [🛠️ Prerequisites](#️-prerequisites)
*   [⚙️ Setup & Configuration](#️-setup--configuration)
*   [☁️ Deployment](#️-deployment)
*   [✅ Unit Tests](#-unit-tests)
*   [🔄 CI/CD (GitHub Actions)](#-cicd-github-actions)

---

## ✨ Features

*   **Real-time Prices:** Fetches current crypto prices via CoinGecko.
*   **Email Notifications:** Sends results to users via Mailtrap (or other SMTP).
*   **Search History:** Stores requests in DynamoDB.
*   **History Retrieval:** Endpoint to get user-specific search history.
*   **Secure Config:** Uses AWS SSM Parameter Store for API keys/secrets.
*   **Serverless:** Built with AWS SAM for easy deployment and scaling.
*   **CI/CD Ready:** GitHub Actions workflow for automated deployments.

---

## 🔌 API Testing & Examples

You can test the deployed API using JavaScript's `fetch` in a browser console or Node.js script, or tools like Postman/Insomnia.

**Base URL:** `https://7rw3f07828.execute-api.eu-north-1.amazonaws.com/prod/`
<br/>
**Test in Postman** : https://www.postman.com/research-geologist-71302572/crypto-api/request/q0ftgih/crypto-api?action=share&creator=33984829&ctx=documentation


### 1. Request Crypto Price (`POST /request-price`)

```javascript
const apiUrl = 'https://7rw3f07828.execute-api.eu-north-1.amazonaws.com/prod/request-price';
const requestBody = {
  cryptoId: 'ethereum', // e.g., bitcoin, ethereum, dogecoin
  email: 'test@example.com'
};

fetch(apiUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(requestBody),
})
.then(response => response.json())
.then(data => console.log('Success:', data))
.catch(error => console.error('Error:', error));

// Expected Console Output (on success):
// Success: { searchId: '...', timestamp: ..., cryptocurrencyId: 'ethereum', queriedPrice: '...', queriedCurrency: 'usd', fetchStatus: 'Success', recipientEmail: 'test@example.com' }
// Also check 'test@example.com' inbox for the notification email.
```

### 2. Get Search History (GET /history)

```javascript
const userEmail = 'test@example.com'; // Use the email from previous requests
const apiUrl = `https://7rw3f07828.execute-api.eu-north-1.amazonaws.com/prod/history?email=${encodeURIComponent(userEmail)}`;


fetch(apiUrl)
  .then(response => response.json())
  .then(data => console.log('History:', data))
  .catch(error => console.error('Error:', error));

// Expected Console Output (on success):
// History: [ { searchId: '...', timestamp: ..., cryptocurrencyId: 'ethereum', ... }, { ... } ]
```

### Example Scenarios

| Endpoint             | Method | Request Data / Query Params                                  | Expected Status Code | Expected Response Body (Partial) / Outcome                                                                                             | Notes                                                          |
| :------------------- | :----- | :----------------------------------------------------------- | :------------------- | :------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------- |
| `/request-price`     | `POST` | `{"cryptoId": "bitcoin", "email": "valid@example.com"}`      | `200`                | `{ "searchId": "...", "fetchStatus": "Success", ... }` <br/>+ Email Sent                                                               | Successful price fetch and record.                             |
| `/request-price`     | `POST` | `{"cryptoId": "nonexistentcoin", "email": "valid@example.com"}` | `502`                | `{ "error": "Failed to retrieve cryptocurrency data.", "details": "Failed to fetch price from CoinGecko: ..." }`                     | CoinGecko fetch fails, record saved with failure status.       |
| `/request-price`     | `POST` | `{"cryptoId": "bitcoin"}`                                    | `400`                | `{ "error": "Bad Request", "details": "Missing 'email' in request body" }`                                                             | Missing required field.                                        |
| `/request-price`     | `POST` | `{"email": "bad-email-format"}`                              | `400`                | `{ "error": "Bad Request", "details": "Invalid 'email' format in request body" }`                                                     | Invalid email format.                                          |
| `/request-price`     | `GET`  | *(N/A)*                                                      | `405`                | `{ "error": "Unsupported HTTP method: GET", "details": "Only POST method is accepted." }`                                               | Wrong HTTP method.                                             |
| `/history`           | `GET`  | `?email=valid@example.com`                                   | `200`                | `[ { "searchId": "...", "recipientEmail": "valid@example.com", ... }, ... ]`                                                          | Returns array of history items.                                |
| `/history`           | `GET`  | *(Missing query param)*                                      | `400`                | `{ "error": "Bad Request", "details": "Missing 'email' query string parameter" }`                                                    | Missing required query parameter.                              |
| `/history`           | `GET`  | `?email=no-history@example.com`                              | `200`                | `[]`                                                                                                                                   | Returns empty array if no history exists for the email.      |
| `/history`           | `POST` | *(N/A)*                                                      | `405`                | `{ "error": "Unsupported HTTP method: POST", "details": "Only GET method is accepted." }`                                                | Wrong HTTP method.                                             |

---

## 🏗️ Architecture & Design

*   **Why Serverless?** Scalability, cost-efficiency, and reduced operational overhead. SAM simplifies infrastructure definition.
*   **Why Microservices?** Separation of concerns (price request vs. history retrieval), independent scaling, and fault isolation.
*   **Why API Gateway (HTTP API)?** Cost-effective, low-latency RESTful entry point.
*   **Why DynamoDB?** Scalable, managed NoSQL DB, ideal for key-value lookups and filtering history items.
*   **Why SSM Parameter Store?** Securely manages sensitive data like API keys outside the code.
*   **Why Caching?** Reduces latency and cost by caching SSM parameters and the email transporter on warm Lambda invokes.

---

## 🏛️ Architecture Diagram
![Architecture Diagram](https://github.com/user-attachments/assets/f8810a4c-3ec0-4430-9d9c-f9de5849eb1a)



---

## 🚀 CI/CD Pipeline

![CI CD Diagram](https://github.com/user-attachments/assets/e28ce8b2-4933-4604-a8aa-c07ca591ffd7)

---

## 🛠️ Prerequisites

*   AWS Account & Configured CLI
*   AWS SAM CLI
*   Node.js (v20.x+) & npm
*   Docker (for `sam build --use-container`)
*   Mailtrap Account & API Token
*   CoinGecko API Key

---

## ⚙️ Setup & Configuration

1.  **Clone:** `git clone <your-repo-url> && cd <repo-dir>`
2.  **Install Deps:** `npm ci`
3.  **Create SSM Parameters:** In AWS SSM (target region):
    *   `/crypto-api/prod/mailtrap/token` (Type: `SecureString`, Value: Your Mailtrap Token)
    *   `/crypto-api/prod/coingecko/apikey` (Type: `SecureString`, Value: Your CoinGecko Key)
    *(Adjust names if changed in `template.yaml`)*
4.  **AWS Credentials:** Ensure your environment or GitHub Actions secrets (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`) have deployment permissions.

---

## ☁️ Deployment

1.  **Build:** `sam build --use-container`
2.  **Deploy:**
    ```bash
    sam deploy \
        --stack-name crypto-api-infra-prod \
        --capabilities CAPABILITY_IAM \
        --no-confirm-changeset \
        --no-fail-on-empty-changeset
    ```
3.  **Get API URL:** Note the `ApiUrl-prod` output from the deployment (e.g., `https://f38ewq1lid.execute-api.eu-north-1.amazonaws.com/`).

---
## ✅ Unit Tests

```bash
npm test
```
---
## 🔄 CI/CD (GitHub Actions)

*   **Workflow:** `.github/workflows/deploy.yml`
*   **Trigger:** Push to `main` branch.
*   **Process:** Installs ➡️ Tests ➡️ Builds (SAM) ➡️ Deploys (SAM).
*   **Secrets Needed:** `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` configured in GitHub repository secrets.
