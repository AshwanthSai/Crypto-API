# Crypto Price API

## Overview
The Crypto Price API is a serverless application designed to provide cryptocurrency price information and maintain a search history for users. It consists of two microservices: the Email Price Service and the Search History Service.

## Microservices

### 1. Email Price Service
- **Functionality**: Queries the current price of a specific cryptocurrency and sends an email with the result using AWS SES.
- **Location**: `services/email-price-service/`
- **Main Logic**: Implemented in `src/handler.js`.
- **Dependencies**: Managed in `package.json`.

### 2. Search History Service
- **Functionality**: Retrieves the search history of cryptocurrency queries made by users.
- **Location**: `services/search-history-service/`
- **Main Logic**: Implemented in `src/handler.js`.
- **Dependencies**: Managed in `package.json`.

## Setup Instructions

### Prerequisites
- Node.js (version 14 or higher)
- AWS Account
- AWS CLI configured with appropriate permissions

### Installation
1. Clone the repository:
   ```
   git clone <repository-url>
   cd crypto-price-api
   ```

2. Install dependencies for each microservice:
   - For Email Price Service:
     ```
     cd services/email-price-service
     npm install
     ```

   - For Search History Service:
     ```
     cd services/search-history-service
     npm install
     ```

## Usage

### Email Price Service
- **Endpoint**: `/email-price`
- **Method**: POST
- **Request Body**:
  ```json
  {
    "cryptocurrency": "bitcoin",
    "email": "user@example.com"
  }
  ```
- **Response**: Sends an email with the current price of the specified cryptocurrency.

### Search History Service
- **Endpoint**: `/search-history`
- **Method**: GET
- **Response**: Returns a list of previous searches with timestamps.

## Deployment
This project is designed to be deployed on AWS using serverless architecture. Consider using AWS SAM or Serverless Framework for deployment.

## License
This project is licensed under the MIT License. See the LICENSE file for details.