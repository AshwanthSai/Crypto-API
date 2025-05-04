// filepath: c:\Users\tonyj\Desktop\IPA---2\src\crypto-price-api\services\email-price-service\jest.config.js
/** @type {import('jest').Config} */
const config = {
    // No specific preset needed if using Node.js ESM and type: "module"
    // Jest (v28+) should handle ESM reasonably well by default with type: "module"
  
    // You might still need to prevent Jest from transforming ESM dependencies in node_modules
    // Adjust the regex based on actual dependencies causing issues if any arise later
    testEnvironment: 'node',
    moduleFileExtensions: ['js', 'json', 'node'],
    transformIgnorePatterns: [
       '/node_modules/(?!(@aws-sdk|uuid|axios|nodemailer)/)',
    ],
  
    // Explicitly tell Jest to treat .js as ESM (can help in some setups)
    extensionsToTreatAsEsm: ['.js'],
  
    // Ensure mocks work with ESM
    // moduleNameMapper might be needed if mocks fail, but unstable_mockModule often works
  };
  
  export default config;