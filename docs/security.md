# Security Guide

This document outlines the security features and best practices for using brain-memory safely.

## Security Architecture

### Defense in Depth
The system implements multiple layers of security:

1. **Data Isolation**: Multi-scope isolation (session/agent/workspace)
2. **Input Validation**: Sanitization of all inputs
3. **Database Security**: Parameterized queries to prevent injection
4. **Access Controls**: Scope-based permissions
5. **Secure Communication**: Encrypted API calls

### Trust Model
- **Trusted Components**: Core system components are trusted
- **Untrusted Inputs**: All user inputs are treated as untrusted
- **External Services**: LLM and embedding services are external dependencies

## Data Protection

### Encryption
- **At Rest**: Database file encryption (user responsibility)
- **In Transit**: HTTPS for all API communications
- **In Memory**: No specific in-memory encryption (follow OS security practices)

### Data Classification
The system handles several types of data:

1. **Public Data**: Shared knowledge and common patterns
2. **Private Data**: Session-specific and user-specific information
3. **Confidential Data**: Credentials and sensitive user information

### Data Retention
- **Automatic Decay**: Weibull model for intelligent forgetting
- **Manual Purge**: Admin controls for data deletion
- **Backup Security**: Encrypted backups with access controls

## Authentication & Authorization

### Multi-Scope Isolation
The system implements three levels of data isolation:

```typescript
interface MemoryScope {
  sessionId?: string;      // Session-level isolation
  agentId?: string;        // Agent-level isolation  
  workspaceId?: string;    // Workspace-level isolation
}
```

### Access Patterns
- **Cross-Scope Access**: Configurable based on permissions
- **Scope Validation**: All queries validated against scope filters
- **Default Isolation**: Strict isolation by default

## Secure Coding Practices

### Input Validation
All external inputs are validated:

```typescript
// Example: Query validation
function validateQuery(query: string): boolean {
  if (query.length > MAX_QUERY_LENGTH) return false;
  if (hasPotentialInjection(query)) return false;
  return true;
}
```

### Output Sanitization
All outputs are sanitized before external exposure:

```typescript
// Example: XML sanitization
function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}
```

### SQL Injection Prevention
All database queries use parameterized statements:

```typescript
// Safe: Parameterized query
db.prepare("SELECT * FROM bm_nodes WHERE name = ?").get(nodeName);

// Avoid: String concatenation
// db.prepare(`SELECT * FROM bm_nodes WHERE name = '${nodeName}'`); // DANGEROUS!
```

## API Security

### Credential Management
- **API Keys**: Stored in environment variables, never in code
- **Key Rotation**: Regular rotation recommended
- **Access Scope**: Use principle of least privilege

### Rate Limiting
Implement external rate limiting for API calls:
```typescript
// Example: Rate limiting at application level
const limiter = new RateLimiter({
  tokensPerInterval: 1000,
  interval: 'hour'
});
```

### Error Handling
Avoid information leakage through error messages:
```typescript
// Safe: Generic error messages
if (error instanceof UnauthorizedError) {
  return { error: "Access denied" };
}

// Avoid: Detailed error messages
// return { error: `DB Error: ${error.stack}` }; // DANGEROUS!
```

## Threat Model

### Potential Threats

1. **Data Leakage**: Unauthorized access to private memories
   - *Mitigation*: Scope isolation, access controls

2. **Injection Attacks**: Malicious inputs causing database corruption
   - *Mitigation*: Input validation, parameterized queries

3. **Prompt Injection**: Manipulating LLM behavior
   - *Mitigation*: Input sanitization, system prompt protection

4. **Denial of Service**: Resource exhaustion
   - *Mitigation*: Rate limiting, resource quotas

5. **Credential Theft**: Compromise of API keys
   - *Mitigation*: Secure storage, rotation policies

### Attack Vectors

#### Query-Level Attacks
- Malicious queries designed to extract unauthorized data
- Mitigation: Scope filtering, access validation

#### Injection Attacks  
- SQL injection through malformed inputs
- Mitigation: Parameterized queries, input validation

#### Prompt Injection
- Crafting inputs to manipulate LLM behavior
- Mitigation: Input sanitization, system prompt hardening

## Privacy Considerations

### Data Minimization
- Only store necessary information
- Automatic decay of unused information
- Configurable retention policies

### Anonymization
- Consider anonymizing sensitive information
- Remove personally identifiable information where possible
- Implement privacy-by-design principles

### Compliance
The system supports compliance with various regulations:
- **GDPR**: Right to erasure, data portability
- **CCPA**: Consumer rights to data access and deletion
- **SOX**: Audit trails and data retention

## Security Best Practices

### For Administrators

1. **Secure Configuration**
   ```bash
   # Use environment variables for secrets
   export OPENAI_API_KEY=sk-...
   
   # Secure database file permissions
   chmod 600 brain-memory.db
   ```

2. **Regular Auditing**
   - Monitor access logs
   - Review scope configurations
   - Validate backup security

3. **Dependency Management**
   - Keep dependencies updated
   - Monitor for security vulnerabilities
   - Use trusted sources only

### For Developers

1. **Secure Coding**
   - Validate all inputs
   - Use parameterized queries
   - Sanitize all outputs
   - Follow principle of least privilege

2. **Secrets Management**
   ```typescript
   // Good: Environment variables
   const apiKey = process.env.OPENAI_API_KEY;
   
   // Bad: Hardcoded secrets
   // const apiKey = "sk-hardcoded-key";
   ```

3. **Error Handling**
   - Don't expose internal details
   - Log security-relevant events
   - Implement proper exception handling

### For Users

1. **Access Control**
   - Use appropriate scope settings
   - Regularly review access permissions
   - Implement strong authentication

2. **Data Classification**
   - Understand data sensitivity levels
   - Apply appropriate retention policies
   - Use proper tagging systems

## Incident Response

### Detection
- Monitor for unusual access patterns
- Track failed authentication attempts
- Log all security-relevant events

### Response Procedures
1. **Containment**: Isolate affected systems
2. **Assessment**: Determine scope and impact
3. **Remediation**: Apply fixes and patches
4. **Recovery**: Restore normal operations
5. **Review**: Document lessons learned

## Security Testing

### Automated Testing
The system includes automated security tests:
- Input validation tests
- Injection prevention tests
- Scope isolation tests

### Manual Testing
Regular security reviews should include:
- Code review for security vulnerabilities
- Penetration testing
- Dependency vulnerability scanning

## Compliance Framework

### Security Controls
The system implements standard security controls:
- **AC**: Access Control
- **AU**: Audit and Accountability
- **CM**: Configuration Management
- **IA**: Identification and Authentication
- **SC**: System and Communications Protection

### Monitoring
- Continuous monitoring of access patterns
- Alerting for suspicious activities
- Regular security assessments

## Conclusion

Security is fundamental to the brain-memory design. By following these guidelines and implementing proper operational procedures, you can maintain a secure environment for your knowledge management needs.

For security incidents or concerns, contact your security team immediately.