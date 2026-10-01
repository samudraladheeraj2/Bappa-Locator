#!/bin/bash
# Generate private key
openssl genrsa -out key.pem 2048
# Create self-signed certificate
openssl req -new -x509 -key key.pem -out cert.pem -days 10000 -subj "/CN=BappaLocator/OU=Development/O=BappaLocator/L=Hyderabad/S=Telangana/C=IN"
# Convert to PKCS12 (compatible with Java KeyStore)
openssl pkcs12 -export -in cert.pem -inkey key.pem -out android/app/release.keystore -name bappalocator -password pass:BappaLocatorSecretPassword123!
# Cleanup
rm key.pem cert.pem
echo "Successfully generated android/app/release.keystore"
