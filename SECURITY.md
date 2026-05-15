# Security Policy

## Supported Versions

The following versions of `homebridge-matter-eufy-mqtt` are currently supported with security updates.

| Version | Supported |
| ------- | --------- |
| Latest release | ✅ |
| Older releases | ❌ |

Only the latest published version on npm and GitHub is considered supported.

---

## Reporting a Vulnerability

If you discover a security vulnerability, please report it privately and responsibly.

### Please do NOT

- Open a public GitHub issue
- Open a public discussion
- Submit a public pull request containing the vulnerability details
- Disclose the issue publicly before it has been reviewed and fixed

### Preferred Reporting Method

Please report vulnerabilities using GitHub's private vulnerability reporting feature:

- Go to the repository Security tab
- Click **Report a vulnerability**

Or contact the maintainer directly:

- GitHub: @SyntaxThaw

If private reporting is unavailable, you may open a minimal issue asking for a secure contact method without disclosing technical details.

---

## What to Include

Please include as much information as possible:

- Description of the vulnerability
- Steps to reproduce
- Affected version(s)
- Potential impact
- Relevant logs or screenshots
- Proof-of-concept code if available
- Suggested mitigation or fix (optional)

Clear reproduction steps help resolve issues faster.

---

## Response Timeline

The project aims to respond to security reports within:

| Action | Target Time |
| --- | --- |
| Initial acknowledgment | Within 72 hours |
| Initial assessment | Within 7 days |
| Status updates | As needed during investigation |
| Security fix release | Depends on severity and complexity |

Please understand this is an open-source project maintained in spare time. Timelines may vary depending on availability and issue complexity.

---

## Scope

This policy applies to:

- The Homebridge plugin itself
- Matter integration logic
- MQTT communication handling
- Authentication/token handling
- Dependency-related security issues
- GitHub Actions and CI/CD workflows in this repository

Third-party services, applications, devices, or cloud APIs are outside the direct scope of this repository.

---

## Security Best Practices for Users

Users are encouraged to:

- Keep Homebridge and Node.js updated
- Use strong credentials for MQTT brokers and Eufy accounts
- Avoid exposing MQTT brokers directly to the internet
- Rotate credentials if compromise is suspected
- Regularly update plugin dependencies
- Use secure Home Assistant / Homebridge environments
- Enable GitHub Dependabot alerts when forking the repository

---

## Security Best Practices for Contributors

Contributors should:

- Never commit secrets, tokens, or credentials
- Review GitHub Actions changes carefully
- Use least-privilege permissions in workflows
- Avoid unsafe shell interpolation in CI scripts
- Keep dependencies updated
- Test changes for security regressions
- Report vulnerabilities privately

---

## Dependency & Supply Chain Security

This project may use automated dependency management and security scanning, including:

- Dependabot
- npm audit
- GitHub security advisories
- GitHub Actions security checks

Security updates may occasionally introduce breaking changes if required to mitigate serious vulnerabilities.

---

## Responsible Disclosure

Please allow reasonable time for investigation and remediation before public disclosure.

Responsible disclosure helps protect users and the broader Homebridge ecosystem.

Researchers acting in good faith and following this policy are appreciated.

---

## Acknowledgments

Thank you to everyone who helps improve the security of this project through responsible disclosure and security research.
