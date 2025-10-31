# 🔐 BSV Blockchain Starter - Security Setup Guide

## ⚠️ **CRITICAL SECURITY NOTICE** 

**If you forked/cloned this repository before October 31, 2025, please read this immediately:**

This repository previously contained exposed private keys and passwords that have been removed. If you have access to the previous version:

### **IMMEDIATE ACTION REQUIRED:**

1. **🚨 DO NOT USE the exposed private keys for any real transactions**
2. **🔄 Rotate all credentials** - The exposed keys/passwords are now invalid
3. **🗑️ Delete any local copies** of the old wallet files with real keys
4. **🔍 Audit your systems** if you used any of the exposed credentials

---

## 🛡️ Secure Setup Instructions

### 1. Environment Configuration

```bash
# Copy the example environment file
cp .env.example .env

# Edit with your actual values (never commit this file!)
nano .env
```

### 2. Generate Secure Wallet Keys

```bash
# Generate new wallet keys
npm run generate:keys

# This will create secure wallet files with your new keys
```

### 3. Set Strong Passwords

Edit your `.env` file and set secure passwords:

```env
# Use strong, unique passwords (min 16 characters)
ADMIN_PASSWORD=your_very_secure_admin_password_here
REGULATOR_PASSWORD=your_very_secure_regulator_password_here

# Generate secure secrets
JWT_SECRET=$(openssl rand -base64 64)
SESSION_SECRET=$(openssl rand -base64 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)
```

### 4. Database Security

```bash
# Initialize database with secure credentials
npm run db:init

# The database will use your .env passwords automatically
```

### 5. Verify Security Setup

```bash
# Run security audit
npm run security:audit

# Check for exposed secrets
npm run security:check-secrets
```

---

## 🔒 Security Best Practices

### File Security
- **Never commit** real private keys, passwords, or API keys
- **Always use** environment variables for sensitive data
- **Regularly audit** your `.gitignore` to ensure it excludes sensitive files
- **Use different** credentials for each environment (dev/staging/prod)

### Key Management
- **Generate unique keys** for each wallet purpose
- **Store production keys** in secure key management systems (AWS KMS, Azure Key Vault, etc.)
- **Implement key rotation** policies (90-day rotation recommended)
- **Use hardware security modules** (HSMs) for high-value operations

### Access Control
- **Limit access** to production systems and credentials
- **Use principle of least privilege** for all accounts
- **Enable multi-factor authentication** wherever possible
- **Audit access logs** regularly

### Network Security
- **Use HTTPS/TLS** for all communications
- **Implement rate limiting** to prevent abuse
- **Use VPNs** for administrative access
- **Regularly update** dependencies and security patches

---

## 🚨 Incident Response

### If You Suspect a Compromise:

1. **Immediately revoke/rotate** all potentially compromised credentials
2. **Audit access logs** for suspicious activity  
3. **Check blockchain transactions** for unauthorized operations
4. **Update all team members** about the incident
5. **Document the incident** and lessons learned

### Emergency Contacts:
- **Security Team**: security@your-organization.com
- **BSV Network**: [BSV Association](https://bitcoinassociation.net/)
- **MongoDB Atlas**: [Support](https://support.mongodb.com/)

---

## 🔧 Security Tools & Commands

### Generate Secure Credentials

```bash
# Generate random password (32 characters)
openssl rand -base64 32

# Generate hex key (64 characters)
openssl rand -hex 32

# Generate UUID
uuidgen

# Generate BSV private key
npm run generate:wallet
```

### Security Auditing

```bash
# Audit npm dependencies
npm audit

# Check for secrets in codebase
git secrets --scan

# Lint security issues
npm run security:lint

# Run full security check
npm run security:full-audit
```

### Backup & Recovery

```bash
# Backup wallet files (encrypted)
npm run wallet:backup

# Test wallet recovery
npm run wallet:test-recovery

# Verify backup integrity
npm run wallet:verify-backup
```

---

## 📋 Security Checklist

### Before Going Live:

- [ ] All default passwords changed
- [ ] Environment variables properly configured
- [ ] `.env` file not committed to git
- [ ] Private keys generated and secured
- [ ] Database credentials rotated
- [ ] API keys configured and restricted
- [ ] Rate limiting implemented
- [ ] HTTPS/SSL certificates configured
- [ ] Firewall rules configured
- [ ] Monitoring and alerting set up
- [ ] Backup and recovery procedures tested
- [ ] Security incident response plan documented
- [ ] Team trained on security procedures

### Regular Security Tasks (Monthly):

- [ ] Rotate API keys and passwords
- [ ] Review access logs
- [ ] Update dependencies
- [ ] Run security scans
- [ ] Test backup procedures
- [ ] Review and update security policies
- [ ] Conduct security training

---

## 🔗 Additional Resources

- [BSV Security Best Practices](https://wiki.bitcoinsv.io/index.php/Security)
- [Node.js Security Checklist](https://nodejs.org/en/docs/guides/security/)
- [MongoDB Security Checklist](https://docs.mongodb.com/manual/administration/security-checklist/)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Git Secrets Tool](https://github.com/awslabs/git-secrets)

---

## 📞 Support

For security-related questions or to report vulnerabilities:

- **Email**: security@smartledger.technology  
- **Security Advisory**: [GitHub Security Advisories](https://github.com/codenlighten/bsv-blockchain-starter/security/advisories)
- **Issues**: [GitHub Issues](https://github.com/codenlighten/bsv-blockchain-starter/issues) (for non-sensitive issues only)

---

**Remember**: Security is not a one-time setup but an ongoing process. Stay vigilant and keep your system updated!