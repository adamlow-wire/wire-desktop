# Untrusted local TLS fixture

This self-signed localhost certificate and its **public test-only private key** are used exclusively by loopback test servers. Never use them for deployment, authentication or a trust store. They were generated for this fixture, not copied from any Wire environment.

The certificate covers `localhost` and `127.0.0.1`, is valid from September 2026 to September 2036, and is deliberately not trusted. Tests must reject it without sending an HTTP request. No test installs a root certificate or disables TLS verification.

Generation: `openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes -subj /CN=localhost -addext subjectAltName=DNS:localhost,IP:127.0.0.1 -days 3650 -keyout key.pem -out cert.pem`.
